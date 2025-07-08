import { Queue, Job, Worker } from 'bullmq';
import { creditUser } from '../../../services/nige-earn/ledger';
import { markRewarded } from '../utils/state-store';
import { ROLES } from '@/constants/roles';
import { redisClient } from '@/db/redis';
import { AccountRoleModel } from '@/db/models';
import { fetchSettings } from '@/services/nige-earn/reward-settings';

export interface ThreadJob {
  userId: string;
  tweetId: string;
  mainPostId: string;
  directReplyId: string;
  tweetCreatedAt: string;
}

const QUEUE = 'threadQueue';
export const threadQueue = new Queue<ThreadJob>(QUEUE, { connection: redisClient });
export async function enqueueThread(job: ThreadJob) {
  console.log(`[thread] enqueueThread:`, job);
  await threadQueue.add('thread', job, { jobId: `${job.userId}:${job.tweetId}` });
}

export const threadWorker = new Worker<ThreadJob>(
  QUEUE,
  async (job: Job<ThreadJob>) => {
    console.log(`[thread] job ${job.id} received:`, job.data);
    const hasRole = await AccountRoleModel.exists({
      accountId: job.data.userId,
      roleId: ROLES.NIGE_EARN_USER,
    });
    if (!hasRole) {
      console.log(`[thread] skipping job ${job.id}: user ${job.data.userId} lacks ${ROLES.NIGE_EARN_USER}`);
      return;
    }

    try {
      const cfg = await fetchSettings();
      const date = new Date(job.data.tweetCreatedAt);
      console.log(`[thread] config loaded; checking caps & eligibility`);

      if (cfg.rewardStartDate && date < cfg.rewardStartDate) {
        console.log(`[thread] skipping job ${job.id}: before start date`);
        return;
      }

      // one‐per‐direct‐reply idempotent
      const idKey = `reward:thread:${job.data.userId}:${job.data.mainPostId}:${job.data.directReplyId}`;
      if (!(await markRewarded(idKey))) {
        console.log(`[thread] skipping job ${job.id}: duplicate`);
        return;
      }

      // cap per main post in Redis
      const countKey = `threadCount:${job.data.userId}:${job.data.mainPostId}`;
      const cnt = await redisClient.incr(countKey);
      if (cnt > cfg.maxThreads) {
        console.log(`[thread] skipping job ${job.id}: maxThreads exceeded (${cnt})`);
        return;
      }

      console.log(`[thread] crediting ${job.data.userId} +${cfg.replyReward}`);
      await creditUser(job.data.userId, cfg.replyReward, {
        type: 'thread',
        mainPostId: job.data.mainPostId,
        directReplyId: job.data.directReplyId,
      });
      console.log(`[thread] job ${job.id} completed`);
    } catch (err: any) {
      console.error(`[thread] job ${job.id} failed:`, err);
      throw err;
    }
  },
  { connection: redisClient, concurrency: 4 }
);

threadWorker.on('completed', (job) => console.log(`✓ [thread] job ${job.id} completed`));
threadWorker.on('failed', (job, err) => console.error(`✗ [thread] job ${job?.id} failed:`, err));
