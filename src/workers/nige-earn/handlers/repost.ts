import { Queue, Job, Worker } from 'bullmq';
import { creditUser } from '../../../services/nige-earn/ledger';
import { markRewarded } from '../utils/state-store';
import { ROLES } from '@/constants/roles';
import { AccountRoleModel } from '@/db/models';
import { redisClient } from '@/db/redis';
import { fetchSettings } from '@/services/nige-earn/reward-settings';

export interface RepostJob {
  userId: string;
  tweetId: string;
  tweetCreatedAt: string;
}

const QUEUE = 'repostQueue';
export const repostQueue = new Queue<RepostJob>(QUEUE, { connection: redisClient });
export async function enqueueRetweet(job: RepostJob) {
  console.log(`[repost] enqueueRetweet:`, job);
  await repostQueue.add('repost', job, { jobId: `${job.userId}:${job.tweetId}` });
}

export const repostWorker = new Worker<RepostJob>(
  QUEUE,
  async (job: Job<RepostJob>) => {
    console.log(`[repost] job ${job.id} received:`, job.data);
    const hasRole = await AccountRoleModel.exists({
      accountId: job.data.userId,
      roleId: ROLES.NIGE_EARN_USER,
    });
    if (!hasRole) {
      console.log(`[repost] skipping job ${job.id}: user ${job.data.userId} lacks ${ROLES.NIGE_EARN_USER}`);
      return;
    }

    try {
      const cfg = await fetchSettings();
      const date = new Date(job.data.tweetCreatedAt);
      console.log(`[repost] config loaded; checking eligibility`);

      const key = `reward:repost:${job.data.userId}:${job.data.tweetId}`;
      if (!(await markRewarded(key))) {
        console.log(`[repost] skipping job ${job.id}: duplicate`);
        return;
      }

      console.log(`[repost] crediting ${job.data.userId} +${cfg.repostReward}`);
      await creditUser(job.data.userId, cfg.repostReward, {
        type: 'repost',
        tweetId: job.data.tweetId,
      });
      console.log(`[repost] job ${job.id} completed`);
    } catch (err: any) {
      console.error(`[repost] job ${job.id} failed:`, err);
      throw err;
    }
  },
  { connection: redisClient, concurrency: 8 }
);

repostWorker.on('completed', (job) => console.log(`✓ [repost] job ${job.id} completed`));
repostWorker.on('failed', (job, err) => console.error(`✗ [repost] job ${job?.id} failed:`, err));
