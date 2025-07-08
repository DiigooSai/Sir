import { redisClient } from '@/db/redis';

function midnightTtlSec(): number {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
}

export async function incrDaily(key: string, ttlMidnight = true): Promise<number> {
  const n = await redisClient.incr(key);
  if (ttlMidnight && n === 1) {
    /* first time → attach expiry till midnight */
    await redisClient.expire(key, midnightTtlSec());
  }
  return n;
}
