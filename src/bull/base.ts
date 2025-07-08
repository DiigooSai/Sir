// src/bull/base.ts
import { Queue, Worker } from 'bullmq';
import { redisClient } from '../db/redis';

/**
 * createQueue
 *   name: queue’s unique name
 *   processor: the async function to run for each job
 * Returns: { queue, worker }
 */
export function createQueue(name: string, processor: (job: any) => Promise<any>) {
  // 1️⃣ Queue: used to add jobs (immediate, delayed, repeatable)
  const queue = new Queue(name, {
    connection: redisClient,
  });

  // 2️⃣ Worker: picks up jobs from the queue
  const worker = new Worker(
    name,
    async (job) => {
      try {
        await processor(job);
      } catch (err) {
        console.error(`[Worker:${name}] Processor error:`, err);
        throw err;
      }
    },
    { connection: redisClient }
  );

  return { queue, worker };
}
