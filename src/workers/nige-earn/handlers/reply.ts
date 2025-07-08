import { Queue, Job, Worker } from 'bullmq';
import { creditUser } from '../../../services/nige-earn/ledger';
import { markRewarded } from '../utils/state-store';
import { incrDaily } from '../utils/limits';
import { ROLES } from '@/constants/roles';
import { AccountRoleModel } from '@/db/models';
import { redisClient } from '@/db/redis';
import { fetchSettings } from '@/services/nige-earn/reward-settings';

export interface ReplyJob {
  userId: string;
  tweetId: string;
  parentId: string;
  tweetCreatedAt: string;
}

const QUEUE = 'replyQueue';
export const replyQueue = new Queue<ReplyJob>(QUEUE, { connection: redisClient });

export async function enqueueReply(job: ReplyJob) {
  console.log(`[reply] enqueueReply:`, job);
  await replyQueue.add('reply', job, { jobId: `${job.userId}:${job.tweetId}` });
}

export const replyWorker = new Worker<ReplyJob>(
  QUEUE,
  async (job: Job<ReplyJob>) => {
    console.log(`[reply] job ${job.id} received:`, job.data);
    const hasRole = await AccountRoleModel.exists({
      accountId: job.data.userId,
      roleId: ROLES.NIGE_EARN_USER,
    });
    if (!hasRole) {
      console.log(`[reply] skipping job ${job.id}: user ${job.data.userId} lacks ${ROLES.NIGE_EARN_USER}`);
      return;
    }

    try {
      const cfg = await fetchSettings();
      const tweetDate = new Date(job.data.tweetCreatedAt);
      console.log(`[reply] config loaded; checking eligibility & caps`);

      if (cfg.rewardStartDate && tweetDate < cfg.rewardStartDate) {
        console.log(`[reply] skipping job ${job.id}: before start date`);
        return;
      }

      // per-post daily cap
      const dailyKey = `daily:replyCount:${job.data.userId}:${job.data.parentId}`;
      const count = await incrDaily(dailyKey);
      if (count > cfg.replyLimit) {
        console.log(`[reply] skipping job ${job.id}: replyLimit exceeded (${count})`);
        return;
      }

      // idempotency
      const key = `reward:reply:${job.data.userId}:${job.data.tweetId}`;
      if (!(await markRewarded(key))) {
        console.log(`[reply] skipping job ${job.id}: duplicate`);
        return;
      }

      console.log(`[reply] crediting ${job.data.userId} +${cfg.replyReward}`);
      await creditUser(job.data.userId, cfg.replyReward, {
        type: 'reply',
        tweetId: job.data.tweetId,
        parentId: job.data.parentId,
      });
      console.log(`[reply] job ${job.id} completed`);
    } catch (err: any) {
      console.error(`[reply] job ${job.id} failed:`, err);
      throw err;
    }
  },
  { connection: redisClient, concurrency: 8 }
);

replyWorker.on('completed', (job) => console.log(`✓ [reply] job ${job.id} completed`));
replyWorker.on('failed', (job, err) => console.error(`✗ [reply] job ${job?.id} failed:`, err));
