import { Queue, Job, Worker } from 'bullmq';
import { creditUser } from '../../../services/nige-earn/ledger';
import { markRewarded } from '../utils/state-store';
import { ROLES } from '@/constants/roles';
import { redisClient } from '@/db/redis';
import { AccountRoleModel } from '@/db/models';
import { fetchSettings } from '@/services/nige-earn/reward-settings';

export interface FollowJob {
  userId: string;
}

const QUEUE = 'followQueue';
export const followQueue = new Queue<FollowJob>(QUEUE, { connection: redisClient });

export async function enqueueFollow(job: FollowJob) {
  console.log(`[follow] enqueueFollow:`, job);
  await followQueue.add('follow', job, { jobId: job.userId });
}

export const followWorker = new Worker<FollowJob>(
  QUEUE,
  async (job: Job<FollowJob>) => {
    console.log(`[follow] job ${job.id} received:`, job.data);
    const hasRole = await AccountRoleModel.exists({
      accountId: job.data.userId,
      roleId: ROLES.NIGE_EARN_USER,
    });
    if (!hasRole) {
      console.log(`[follow] skipping job ${job.id}: user ${job.data.userId} lacks ${ROLES.NIGE_EARN_USER}`);
      return;
    }

    try {
      const cfg = await fetchSettings();
      const key = `reward:follow:${job.data.userId}`;

      // zero-expiry: only once
      if (!(await markRewarded(key, 0))) {
        console.log(`[follow] skipping job ${job.id}: duplicate`);
        return;
      }

      console.log(`[follow] crediting ${job.data.userId} +${cfg.followReward}`);
      await creditUser(job.data.userId, cfg.followReward, {
        type: 'follow',
      });
      console.log(`[follow] job ${job.id} completed`);
    } catch (err: any) {
      console.error(`[follow] job ${job.id} failed:`, err);
      throw err;
    }
  },
  { connection: redisClient, concurrency: 1 }
);

followWorker.on('completed', (job) => console.log(`✓ [follow] job ${job.id} completed`));
followWorker.on('failed', (job, err) => console.error(`✗ [follow] job ${job?.id} failed:`, err));
