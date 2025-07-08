import { Queue, Job, Worker } from 'bullmq';
import { creditUser } from '../../../services/nige-earn/ledger';
import { markRewarded } from '../utils/state-store';
import { ROLES } from '@/constants/roles';
import { redisClient } from '@/db/redis';
import { AccountRoleModel } from '@/db/models';
import { fetchSettings } from '@/services/nige-earn/reward-settings';

export interface NotificationJob {
  userId: string;
}

const QUEUE = 'notificationQueue';
export const notificationQueue = new Queue<NotificationJob>(QUEUE, { connection: redisClient });

export async function enqueueNotification(job: NotificationJob) {
  console.log(`[notification] enqueueNotification:`, job);
  await notificationQueue.add('notify', job, { jobId: job.userId });
}

export const notificationWorker = new Worker<NotificationJob>(
  QUEUE,
  async (job: Job<NotificationJob>) => {
    console.log(`[notification] job ${job.id} received:`, job.data);
    const hasRole = await AccountRoleModel.exists({
      accountId: job.data.userId,
      roleId: ROLES.NIGE_EARN_USER,
    });
    if (!hasRole) {
      console.log(`[notification] skipping job ${job.id}: user ${job.data.userId} lacks ${ROLES.NIGE_EARN_USER}`);
      return;
    }

    try {
      const cfg = await fetchSettings();
      const key = `reward:notification:${job.data.userId}`;

      // zero-expiry: only once
      if (!(await markRewarded(key, 0))) {
        console.log(`[notification] skipping job ${job.id}: duplicate`);
        return;
      }

      console.log(`[notification] crediting ${job.data.userId} +${cfg.notificationReward}`);
      await creditUser(job.data.userId, cfg.notificationReward, {
        type: 'notification',
      });
      console.log(`[notification] job ${job.id} completed`);
    } catch (err: any) {
      console.error(`[notification] job ${job.id} failed:`, err);
      throw err;
    }
  },
  { connection: redisClient, concurrency: 1 }
);

notificationWorker.on('completed', (job) => console.log(`✓ [notification] job ${job.id} completed`));
notificationWorker.on('failed', (job, err) => console.error(`✗ [notification] job ${job?.id} failed:`, err));
