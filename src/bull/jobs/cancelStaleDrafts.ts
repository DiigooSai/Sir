// src/bull/jobs/cancelStaleDrafts.ts
import { scheduleCronJob } from '../utils/cronUtility';
import { CRON_SCHEDULES } from '../cronSchedules';
import { NigeLinkProjectModel } from '@/db/models/nige-link/nige-link-project';

const QUEUE_NAME = 'cancel-stale-drafts';

async function cancelStaleDraftsProcessor(job: any) {
  console.log(`[${QUEUE_NAME}] Job ${job.id} running at ${new Date().toISOString()}`);

  // const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
  // const result = await NigeLinkProjectModel.updateMany({ status: 'draft', createdAt: { $lt: fifteenDaysAgo } }, { $set: { status: 'cancelled' } });
  // console.log(`[${QUEUE_NAME}] matched=${result.matchedCount}, modified=${result.modifiedCount}`);

  // delete project logic
  // delete the associated resources from digital ocean and then from db
}

/**
 * initCancelStaleDraftsCron
 *   Schedules “cancel-stale-drafts” to run daily at midnight (or as configured).
 */
export async function initCancelStaleDraftsCron() {
  await scheduleCronJob(QUEUE_NAME, CRON_SCHEDULES.DAILY_MIDNIGHT, cancelStaleDraftsProcessor);
}
