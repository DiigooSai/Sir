// src/bull/jobs/cancelStaleDrafts.ts
import { scheduleCronJob } from '../utils/cronUtility';
import { CRON_SCHEDULES } from '../cronSchedules';
import { NigeLinkProjectModel } from '@/db/models/nige-link/nige-link-project';

const QUEUE_NAME = 'run-in-every-second';

async function archiveAndAbandonProcessor(job: any) {
  const now = Date.now();
  const fiveSecondsAgo = new Date(now - 5000);

  console.log(`[${QUEUE_NAME}] Job ${job.id} running at ${new Date().toISOString()}`);

  // Find all projects still in “draft” whose createdAt < fiveSecondsAgo
  const result = await NigeLinkProjectModel.updateMany(
    {
      status: 'draft',
      createdAt: { $lt: fiveSecondsAgo },
    },
    {
      $set: { status: 'abandoned', archivedAt: new Date() },
    }
  );

  console.log(`[${QUEUE_NAME}] matched=${result.matchedCount}, modified=${result.modifiedCount}`);
}

export async function initArchiveAndAbandonCron() {
  await scheduleCronJob(QUEUE_NAME, CRON_SCHEDULES.EVERY_5_SECONDS, archiveAndAbandonProcessor);
}
