import { initArchiveAndAbandonCron } from './jobs/runEverySecond';
import { clearAllRepeatables } from './utils/clearAllQueues';

export async function initCrons() {
  await clearAllRepeatables(); // DO NOT REMOVE
  //   await initCancelStaleDrafts();
  // await initArchiveAndAbandonCron();

  console.log('✅ All cron jobs initialized');
}
