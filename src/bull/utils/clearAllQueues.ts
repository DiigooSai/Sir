import { redisClient } from '../../db/redis';

export async function clearAllRepeatables() {
  // 1️⃣ Find all keys ending with “:repeat” (BullMQ v2 uses “bull:<queue>:repeat”)
  const keys = await redisClient.keys('*:repeat');

  if (keys.length === 0) {
    console.log('[clearAllRepeatables] No repeatable‐job keys found; nothing to clear.');
    return;
  }

  // 2️⃣ Delete each matching key
  for (const key of keys) {
    await redisClient.del(key);
    console.log(`[clearAllRepeatables] Deleted Redis key: ${key}`);
  }
}
