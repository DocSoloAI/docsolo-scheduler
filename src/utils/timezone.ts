// src/utils/timezone.ts
import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";

/**
 * Convert a UTC date string or Date → Date in target timezone
 */
export function fromUTCToTZ(date: string | Date, tz: string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return toZonedTime(d, tz);
}

/**
 * Convert a local Date (in provider's timezone) → equivalent UTC Date
 */
export function fromTZToUTC(dateInput: Date, tz: string = "America/New_York"): Date {
  return fromZonedTime(dateInput, tz);
}

/**
 * Format a Date in a specific timezone with a pattern
 * (e.g. "yyyy-MM-dd HH:mm")
 */
export function formatInTZ(date: Date, tz: string, pattern: string) {
  return formatInTimeZone(date, tz, pattern);
}
