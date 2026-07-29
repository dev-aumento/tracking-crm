/**
 * Single workspace timezone for the entire app.
 * Asia/Kolkata (IST) has no daylight saving — fixed UTC+05:30.
 */
export const WORK_TIMEZONE = "Asia/Kolkata";
export const WORK_TIMEZONE_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export const WORK_TIMEZONE_LABEL = "Mumbai (IST)";

/** Calendar / clock parts of an instant in IST. */
export function workZoneDateParts(date: Date | string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const shifted = new Date(new Date(date).getTime() + WORK_TIMEZONE_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

/** YYYY-MM-DD for an instant in IST. */
export function workZoneDateKey(date: Date | string): string {
  const { year, month, day } = workZoneDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Convert an IST wall-clock time to a UTC Date instant. */
export function workZoneWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0,
  ms = 0,
): Date {
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute, second, ms) - WORK_TIMEZONE_OFFSET_MS,
  );
}

export function startOfWorkZoneDay(date: Date | string = new Date()): Date {
  const { year, month, day } = workZoneDateParts(date);
  return workZoneWallTimeToUtc(year, month, day, 0, 0, 0, 0);
}

export function endOfWorkZoneDay(date: Date | string = new Date()): Date {
  const { year, month, day } = workZoneDateParts(date);
  return workZoneWallTimeToUtc(year, month, day, 23, 59, 59, 999);
}

/** Weekday of an IST calendar date (0 = Sunday … 6 = Saturday). */
export function workZoneWeekday(date: Date | string): number {
  const { year, month, day } = workZoneDateParts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function formatInWorkZone(
  date: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  locale = "en-IN",
): string {
  if (date == null || date === "") return "—";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(locale, { ...options, timeZone: WORK_TIMEZONE });
}

export function formatWorkZoneDate(
  date: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    month: "long",
    day: "numeric",
    year: "numeric",
  },
  locale = "en-IN",
): string {
  return formatInWorkZone(date, options, locale);
}

export function formatWorkZoneTime(
  date: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  },
  locale = "en-IN",
): string {
  return formatInWorkZone(date, options, locale);
}

export function formatWorkZoneDateTime(
  date: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  },
  locale = "en-IN",
): string {
  return formatInWorkZone(date, options, locale);
}

/** Format a YYYY-MM-DD calendar key without shifting by browser timezone. */
export function formatWorkZoneDateKey(
  dateKey: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  },
  locale = "en-IN",
): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  return formatInWorkZone(workZoneWallTimeToUtc(y, m, d, 12, 0, 0), options, locale);
}

/** Greeting based on Asia/Kolkata wall-clock hour. */
export function istTimeOfDayGreeting(date: Date | string = new Date()): string {
  const { hour } = workZoneDateParts(date);
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
