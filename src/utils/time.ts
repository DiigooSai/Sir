import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

/** Convert “2025-06-20 14:00” in admin’s zone → UTC ISO string */
export function localISOtoUTC(localISO: string, zone: string): string {
  return dayjs.tz(localISO, zone).utc().toISOString(); // → "2025-06-20T08:30:00.000Z"
}

/** Convert UTC ISO string → Day.js in the user’s zone */
export function utcToUser(utcISO: string, userZone: string) {
  return dayjs.utc(utcISO).tz(userZone); // Day.js instance in local zone
}

export const adminZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
