import { redisClient } from '@/db/redis';
import { submitQuizAttempt } from '@/services/nige-nest/lms/quiz-attempt';
import Redis from 'ioredis';

const sub = new Redis(process.env.REDIS_URL!);

export async function startExpiryWatcher() {
  // enable expired-key notifications
  await redisClient.config('SET', 'notify-keyspace-events', 'Ex');
  await sub.subscribe('__keyevent@0__:expired');
  sub.on('message', async (_ch, key) => {
    if (!key.startsWith('quiz:attempt:')) return;

    const id = key.split(':')[2];
    console.log(`startExpiryWatcher ${id}: start`);
    try {
      await submitQuizAttempt(id, null);
      console.log(`Auto-submitted expired ${id}`);
    } catch (e) {
      console.error(`Expiry submit failed ${id}`, e);
    }
    console.log(`startExpiryWatcher ${id}: end`);
  });
}
