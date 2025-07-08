import Redis from 'ioredis';

export const redisClient = new Redis(process.env.REDIS_URL!, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

// ← Prevent unhandled‐error crashes
redisClient.on('error', (err) => {
  console.error('❌ Redis client error:', err);
});

export async function connectRedis(): Promise<void> {
  if (['connecting', 'connect', 'ready'].includes(redisClient.status)) {
    return; // already in flight or done
  }

  try {
    await redisClient.connect();
    console.log('✅ Redis connected');
  } catch (err) {
    console.error('❌ Redis connect failed:', err);
    process.exit(1);
  }
}
