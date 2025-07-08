import connectDB from '@/db/connect';
import { connectRedis, redisClient } from '@/db/redis';

(async () => {
  console.log('🟢 Worker bootstrap starting...');

  // 1️⃣ Connect to MongoDB
  await connectDB();
  console.log('✅ MongoDB connected');

  // 2️⃣ Connect to Redis
  await connectRedis();
  console.log('✅ Redis connected');

  // 3️⃣ Load all job handlers (via registry import side-effects)
  console.log('🔄 Loading job handlers...');
  const { Handlers } = await import('./registry');
  console.log('✅ Handlers loaded for queues:', Object.keys(Handlers).join(', '));

  // 3.1️⃣ **Also** load the poll worker so it actually runs
  console.log('🔄 Loading poll worker...');
  await import('./twitter-poll');
  console.log('✅ Poll worker loaded');

  // 4️⃣ Schedule the repeatable “pollMainQueue” job every minute
  console.log('🔄 Scheduling pollMainQueue (every 60s)...');
  const { Queue } = await import('bullmq');
  const pollQueue = new Queue('pollMainQueue', { connection: redisClient });
  await pollQueue.add('poll-main', {}, { repeat: { every: 60_000 }, jobId: 'poll-main' });

  console.log('🟢 Worker started – pollMainQueue scheduled; queues online:', Object.keys(Handlers).join(', '));
})().catch((err) => {
  console.error('❌ Worker bootstrap error:', err);
  process.exit(1);
});
