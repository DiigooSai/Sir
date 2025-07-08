import { Queue, Job, Worker } from 'bullmq';
import { creditUser } from '../../../services/nige-earn/ledger';
import { markRewarded } from '../utils/state-store';
import { ROLES } from '@/constants/roles';
import { redisClient } from '@/db/redis';
import { AccountRoleModel } from '@/db/models';
import { fetchSettings } from '@/services/nige-earn/reward-settings';

const QUEUE = 'bookmarkQueue';

export interface BookmarkJob {
  userId: string;
  tweetId: string;
  tweetCreatedAt: string;
}

export const bookmarkQueue = new Queue<BookmarkJob>(QUEUE, { connection: redisClient });
export async function enqueueBookmark(job: BookmarkJob) {
  console.log(`[bookmark] enqueueBookmark:`, job);
  await bookmarkQueue.add('bookmark', job, { jobId: `${job.userId}:${job.tweetId}` });
}

export const bookmarkWorker = new Worker<BookmarkJob>(
  QUEUE,
  async (job: Job<BookmarkJob>) => {
    console.log(`[bookmark] job ${job.id} received:`, job.data);
    const hasRole = await AccountRoleModel.exists({
      accountId: job.data.userId,
      roleId: ROLES.NIGE_EARN_USER,
    });
    if (!hasRole) {
      console.log(`[bookmark] skipping job ${job.id}: user ${job.data.userId} lacks ${ROLES.NIGE_EARN_USER}`);
      return;
    }

    try {
      const cfg = await fetchSettings();
      const date = new Date(job.data.tweetCreatedAt);
      console.log(`[bookmark] loaded config; checking eligibility`);

      const key = `reward:bookmark:${job.data.userId}:${job.data.tweetId}`;
      if (!(await markRewarded(key))) {
        console.log(`[bookmark] skipping job ${job.id}: duplicate`);
        return;
      }

      console.log(`[bookmark] crediting ${job.data.userId} +${cfg.bookmarkReward}`);
      await creditUser(job.data.userId, cfg.bookmarkReward, {
        type: 'bookmark',
        tweetId: job.data.tweetId,
      });
      console.log(`[bookmark] job ${job.id} done`);
    } catch (err: any) {
      console.error(`[bookmark] job ${job.id} failed:`, err);
      throw err;
    }
  },
  { connection: redisClient, concurrency: 8 }
);

bookmarkWorker.on('completed', (job) => console.log(`✓ [bookmark] job ${job.id} completed`));
bookmarkWorker.on('failed', (job, err) => console.error(`✗ [bookmark] job ${job?.id} failed:`, err));
