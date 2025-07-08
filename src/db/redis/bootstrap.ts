import { connectRedis } from '.';
import { sweepOrphanedAttempts } from './nest/orphaned-attempts-sweeper';
import { startExpiryWatcher } from './nest/redis-expiry-watcher';

export async function bootstrapRedis() {
  await sweepOrphanedAttempts().catch(console.error);
  await connectRedis();
  await startExpiryWatcher().catch(console.error);
}
