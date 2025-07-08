import { redisClient } from '@/db/redis';

/**
 * Fast idempotency helpers powered by Redis.
 *
 *  • markRewarded returns true if we *just* set it (first time),
 *    false if key already existed (duplicate).
 *  • Default TTL raised to ~6 months.
 */
const SIX_MONTHS_SEC = 60 * 60 * 24 * 30 * 6; // ≈15552000 seconds

export async function markRewarded(key: string, ttlSec = SIX_MONTHS_SEC): Promise<boolean> {
  if (ttlSec <= 0) {
    // no expiry → permanent dedupe
    return (await redisClient.set(key, '1', 'NX')) === 'OK';
  }
  // set with this long TTL
  return (await redisClient.set(key, '1', 'EX', ttlSec, 'NX')) === 'OK';
}
