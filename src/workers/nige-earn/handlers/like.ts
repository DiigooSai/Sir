import { Queue, Job, Worker } from 'bullmq';
import { creditUser } from '../../../services/nige-earn/ledger';
import { markRewarded } from '../utils/state-store';
import { ROLES } from '@/constants/roles';
import { redisClient } from '@/db/redis';
import { AccountRoleModel } from '@/db/models';
import { fetchSettings } from '@/services/nige-earn/reward-settings';

const QUEUE = 'likeQueue';

export interface LikeJobData {
  userId: string;
  tweetId: string;
  tweetCreatedAt: string;
}

/* Producer */
export const likeQueue = new Queue<LikeJobData>(QUEUE, { connection: redisClient });
export async function enqueueLike(job: LikeJobData) {
  console.log(`[like] enqueueLike:`, job);
  await likeQueue.add('like', job, { jobId: `${job.userId}:${job.tweetId}` });
}

/* Worker */
export const likeWorker = new Worker<LikeJobData>(
  QUEUE,
  async (job: Job<LikeJobData>) => {
    console.log(`[like] job ${job.id} received:`, job.data);

    // 1️⃣ Enforce that user has the nigeEarn:user role
    const hasRole = await AccountRoleModel.exists({
      accountId: job.data.userId,
      roleId: ROLES.NIGE_EARN_USER,
    });
    if (!hasRole) {
      console.log(`[like] skipping job ${job.id}: user ${job.data.userId} is not a ${ROLES.NIGE_EARN_USER}`);
      return;
    }

    try {
      // 2️⃣ Load reward settings & check date eligibility
      const cfg = await fetchSettings();
      const tweetDate = new Date(job.data.tweetCreatedAt);
      console.log(`[like] config loaded; checking eligibility for ${job.id}`);

      const eligible = !cfg.rewardStartDate || tweetDate >= cfg.rewardStartDate || cfg.whitelistedTweetIds.includes(job.data.tweetId);

      if (!eligible) {
        console.log(`[like] skipping job ${job.id}: tweet not eligible by date/whitelist`);
        return;
      }

      // 3️⃣ Idempotency
      const key = `reward:like:${job.data.userId}:${job.data.tweetId}`;
      if (!(await markRewarded(key))) {
        console.log(`[like] skipping job ${job.id}: duplicate reward`);
        return;
      }

      // 4️⃣ Credit the user
      console.log(`[like] crediting ${job.data.userId} +${cfg.likeReward}`);
      await creditUser(job.data.userId, cfg.likeReward, {
        type: 'like',
        tweetId: job.data.tweetId,
      });
      console.log(`[like] job ${job.id} completed successfully`);
    } catch (err: any) {
      console.error(`[like] job ${job.id} failed:`, err);
      throw err;
    }
  },
  { connection: redisClient, concurrency: 8 }
);

likeWorker.on('completed', (job) => console.log(`✓ [like] job ${job.id} completed`));
likeWorker.on('failed', (job, err) => console.error(`✗ [like] job ${job?.id} failed:`, err));
