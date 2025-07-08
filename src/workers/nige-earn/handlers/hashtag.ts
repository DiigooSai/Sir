import { Queue, Job, Worker } from 'bullmq';
import { creditUser } from '../../../services/nige-earn/ledger';
import { markRewarded } from '../utils/state-store';
import { incrDaily } from '../utils/limits';
import { ROLES } from '@/constants/roles';
import { redisClient } from '@/db/redis';
import { AccountRoleModel } from '@/db/models';
import { fetchSettings } from '@/services/nige-earn/reward-settings';

export interface HashtagJob {
  userId: string;
  tweetId: string;
  tag: string;
  tweetCreatedAt: string;
}

const QUEUE = 'hashtagQueue';
export const hashtagQueue = new Queue<HashtagJob>(QUEUE, { connection: redisClient });

export async function enqueueHashtag(job: HashtagJob) {
  console.log(`[hashtag] enqueueHashtag:`, job);
  await hashtagQueue.add('hashtag', job, { jobId: `${job.userId}:${job.tweetId}:${job.tag}` });
}

export const hashtagWorker = new Worker<HashtagJob>(
  QUEUE,
  async (job: Job<HashtagJob>) => {
    console.log(`[hashtag] job ${job.id} received:`, job.data);
    const hasRole = await AccountRoleModel.exists({
      accountId: job.data.userId,
      roleId: ROLES.NIGE_EARN_USER,
    });
    if (!hasRole) {
      console.log(`[hashtag] skipping job ${job.id}: user ${job.data.userId} lacks ${ROLES.NIGE_EARN_USER}`);
      return;
    }

    try {
      const cfg = await fetchSettings();
      const date = new Date(job.data.tweetCreatedAt);
      console.log(`[hashtag] config loaded; checking caps & eligibility`);

      // daily per-tag cap
      const dailyKey = `daily:tag:${job.data.userId}:${job.data.tag}`;
      const n = await incrDaily(dailyKey);
      if (n > cfg.dailyLimit) {
        console.log(`[hashtag] skipping job ${job.id}: dailyLimit exceeded (${n})`);
        return;
      }

      // idempotency
      const key = `reward:tag:${job.data.userId}:${job.data.tweetId}:${job.data.tag}`;
      if (!(await markRewarded(key))) {
        console.log(`[hashtag] skipping job ${job.id}: duplicate`);
        return;
      }

      const reward = cfg.hashtags.find((h) => h.tag === job.data.tag)?.reward || 0;
      if (reward <= 0) {
        console.log(`[hashtag] skipping job ${job.id}: no reward for this tag`);
        return;
      }

      console.log(`[hashtag] crediting ${job.data.userId} +${reward}`);
      await creditUser(job.data.userId, reward, {
        type: 'hashtag',
        tweetId: job.data.tweetId,
        tag: job.data.tag,
      });
      console.log(`[hashtag] job ${job.id} completed`);
    } catch (err: any) {
      console.error(`[hashtag] job ${job.id} failed:`, err);
      throw err;
    }
  },
  { connection: redisClient, concurrency: 4 }
);

hashtagWorker.on('completed', (job) => console.log(`✓ [hashtag] job ${job.id} completed`));
hashtagWorker.on('failed', (job, err) => console.error(`✗ [hashtag] job ${job?.id} failed:`, err));
