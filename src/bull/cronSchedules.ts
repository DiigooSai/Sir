// src/bull/cronSchedules.ts
export const CRON_SCHEDULES = {
  EVERY_SECOND: '* * * * * *', // Every second
  EVERY_5_SECONDS: '*/5 * * * * *', // Every 5 seconds
  EVERY_MINUTE: '* * * * *', // Every minute
  EVERY_5_MINUTES: '*/5 * * * *', // Every 5 minutes
  EVERY_10_MINUTES: '*/10 * * * *', // Every 10 minutes
  EVERY_30_MINUTES: '*/30 * * * *', // Every 30 minutes
  HOURLY: '0 * * * *', // Every hour
  EVERY_2_HOURS: '0 */2 * * *', // Every 2 hours
  EVERY_6_HOURS: '0 */6 * * *', // Every 6 hours
  DAILY_MIDNIGHT: '0 0 * * *', // Every day at midnight
  DAILY_NOON: '0 12 * * *', // Every day at noon
  WEEKLY: '0 0 * * 0', // Every Sunday at midnight
  MONTHLY: '0 0 1 * *', // The 1st of every month at midnight
  YEARLY: '0 0 1 1 *', // January 1st every year at midnight
  MONDAY_MIDNIGHT: '0 0 * * 1', // Every Monday at midnight
  FRIDAY_NOON: '0 12 * * 5', // Every Friday at noon
  EVERY_WEEKDAY_MIDNIGHT: '0 0 * * 1-5', // Monday–Friday at midnight
};
