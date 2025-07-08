// src/bull/utils/cronUtility.ts
import { Queue, Worker } from 'bullmq';
import { redisClient } from '../../db/redis';

/**
 * scheduleCronJob
 *   name:          unique queue name
 *   cronSchedule:  one of CRON_SCHEDULES (cron string)
 *   processor:     async function(job) => void
 *
 * Creates (or reuses) a BullMQ queue and worker, and schedules a repeatable job
 * using the given cron expression. If a repeatable job with the same name already
 * exists, scheduling is skipped.
 */
export async function scheduleCronJob(name: string, cronSchedule: string, processor: (job: any) => Promise<void>) {
  // 1️⃣ Instantiate (or reuse) the queue
  const queue = new Queue(name, { connection: redisClient });

  // 2️⃣ Create a worker that runs the given processor
  const worker = new Worker(
    name,
    async (job) => {
      try {
        await processor(job);
      } catch (err) {
        console.error(`[Worker:${name}] Error in processor:`, err);
        throw err;
      }
    },
    { connection: redisClient }
  );

  // Optional: listen for failures
  worker.on('failed', (job, err) => {
    console.error(`[Worker:${name}] Job ${job.id} failed:`, err);
  });

  // 3️⃣ Check if the repeatable job is already scheduled
  const existing = await queue.getRepeatableJobs();
  const alreadyScheduled = existing.some((j) => j.name === name && j.cron === cronSchedule);

  if (!alreadyScheduled) {
    // 4️⃣ Add a repeatable job using cron expression
    await queue.add(
      name, // the job name must match queue name
      {}, // no payload needed
      {
        repeat: { cron: cronSchedule, tz: 'UTC' },
        removeOnComplete: true,
      }
    );
    console.log(`[${name}] Scheduled repeatable job at "${cronSchedule}"`);
  } else {
    console.log(`[${name}] Already scheduled; skipping`);
  }
}
