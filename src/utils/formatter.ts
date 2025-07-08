// src/core/utils/formatter.ts
import dayjs from 'dayjs';

/** Capitalize the first letter */
export function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Format a Date to DD:MM:YYYY HH:mm:ss */
export const formatTimestamp = (createdAt: Date): string => (dayjs(createdAt).isValid() ? dayjs(createdAt).format('DD:MM:YYYY HH:mm:ss') : '');
