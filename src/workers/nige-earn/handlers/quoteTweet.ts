import { Queue, Job, Worker } from 'bullmq';
import { creditUser } from '../../../services/nige-earn/ledger';
import { markRewarded } from '../utils/state-store';
import { ROLES } from '@/constants/roles';
import { redisClient } from '@/db/redis';
import { AccountRoleModel } from '@/db/models';
import { fetchSettings } from '@/services/nige-earn/reward-settings';

export interface QuoteTweetJob {
  userId: string;
  tweetId: string;
  tweetCreatedAt: string;
}

const QUEUE = 'quoteTweetQueue';
export const quoteTweetQueue = new Queue<QuoteTweetJob>(QUEUE, { connection: redisClient });
export async function enqueueQuoteTweet(job: QuoteTweetJob) {
  console.log(`[quoteTweet] enqueueQuoteTweet:`, job);
  await quoteTweetQueue.add('quoteTweet', job, { jobId: `${job.userId}:${job.tweetId}` });
}

export const quoteTweetWorker = new Worker<QuoteTweetJob>(
  QUEUE,
  async (job: Job<QuoteTweetJob>) => {
    console.log(`[quoteTweet] job ${job.id} received:`, job.data);
    const hasRole = await AccountRoleModel.exists({
      accountId: job.data.userId,
      roleId: ROLES.NIGE_EARN_USER,
    });
    if (!hasRole) {
      console.log(`[quoteTweet] skipping job ${job.id}: user ${job.data.userId} lacks ${ROLES.NIGE_EARN_USER}`);
      return;
    }

    try {
      const cfg = await fetchSettings();
      const date = new Date(job.data.tweetCreatedAt);
      console.log(`[quoteTweet] config loaded; checking eligibility`);

      const key = `reward:quote:${job.data.userId}:${job.data.tweetId}`;
      if (!(await markRewarded(key))) {
        console.log(`[quoteTweet] skipping job ${job.id}: duplicate`);
        return;
      }

      console.log(`[quoteTweet] crediting ${job.data.userId} +${cfg.quoteTweetReward}`);
      await creditUser(job.data.userId, cfg.quoteTweetReward, {
        type: 'quoteTweet',
        tweetId: job.data.tweetId,
      });
      console.log(`[quoteTweet] job ${job.id} done`);
    } catch (err: any) {
      console.error(`[quoteTweet] job ${job.id} failed:`, err);
      throw err;
    }
  },
  { connection: redisClient, concurrency: 8 }
);

quoteTweetWorker.on('completed', (job) => console.log(`✓ [quoteTweet] job ${job.id} completed`));
quoteTweetWorker.on('failed', (job, err) => console.error(`✗ [quoteTweet] job ${job?.id} failed:`, err));
