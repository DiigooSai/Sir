import { Queue, Job, Worker } from 'bullmq';
import { creditUser } from '../../../services/nige-earn/ledger';
import { markRewarded } from '../utils/state-store';
import { incrDaily } from '../utils/limits';
import { ROLES } from '@/constants/roles';
import { AccountRoleModel } from '@/db/models';
import { redisClient } from '@/db/redis';
import { fetchSettings } from '@/services/nige-earn/reward-settings';

export interface CashtagJob {
  userId: string;
  tweetId: string;
  tag: string;
  tweetCreatedAt: string;
}

const QUEUE = 'cashtagQueue';
export const cashtagQueue = new Queue<CashtagJob>(QUEUE, { connection: redisClient });

export async function enqueueCashtag(job: CashtagJob) {
  console.log(`[cashtag] enqueueCashtag:`, job);
  await cashtagQueue.add('cashtag', job, { jobId: `${job.userId}:${job.tweetId}:${job.tag}` });
}

export const cashtagWorker = new Worker<CashtagJob>(
  QUEUE,
  async (job: Job<CashtagJob>) => {
    console.log(`[cashtag] job ${job.id} received:`, job.data);
    const hasRole = await AccountRoleModel.exists({
      accountId: job.data.userId,
      roleId: ROLES.NIGE_EARN_USER,
    });
    if (!hasRole) {
      console.log(`[cashtag] skipping job ${job.id}: user ${job.data.userId} lacks ${ROLES.NIGE_EARN_USER}`);
      return;
    }

    try {
      const cfg = await fetchSettings();
      const date = new Date(job.data.tweetCreatedAt);
      console.log(`[cashtag] config loaded; checking caps & eligibility`);

      // daily per-tag cap
      const dailyKey = `daily:tag:${job.data.userId}:${job.data.tag}`;
      const n = await incrDaily(dailyKey);
      if (n > cfg.dailyLimit) {
        console.log(`[cashtag] skipping job ${job.id}: dailyLimit exceeded (${n})`);
        return;
      }

      // idempotency
      const key = `reward:tag:${job.data.userId}:${job.data.tweetId}:${job.data.tag}`;
      if (!(await markRewarded(key))) {
        console.log(`[cashtag] skipping job ${job.id}: duplicate`);
        return;
      }

      const reward = cfg.cashtags.find((c) => c.tag === job.data.tag)?.reward || 0;
      if (reward <= 0) {
        console.log(`[cashtag] skipping job ${job.id}: no reward for this tag`);
        return;
      }

      console.log(`[cashtag] crediting ${job.data.userId} +${reward}`);
      await creditUser(job.data.userId, reward, {
        type: 'cashtag',
        tweetId: job.data.tweetId,
        tag: job.data.tag,
      });
      console.log(`[cashtag] job ${job.id} completed`);
    } catch (err: any) {
      console.error(`[cashtag] job ${job.id} failed:`, err);
      throw err;
    }
  },
  { connection: redisClient, concurrency: 4 }
);

cashtagWorker.on('completed', (job) => console.log(`✓ [cashtag] job ${job.id} completed`));
cashtagWorker.on('failed', (job, err) => console.error(`✗ [cashtag] job ${job?.id} failed:`, err));
