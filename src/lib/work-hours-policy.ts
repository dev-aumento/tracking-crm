export const REQUIRED_WEEKLY_HOURS = 42;
export const REQUIRED_DAILY_HOURS = 8.5;

export type BreakdownPeriod = "week" | "month";

/** Stored attendance duration in seconds (prefers durationSeconds over legacy minutes). */
export function attendanceEntrySeconds(entry: {
  durationSeconds?: number | null;
  duration?: number | null;
  clockIn?: Date | string;
  clockOut?: Date | string | null;
}): number {
  if (entry.durationSeconds != null) {
    return Math.max(0, entry.durationSeconds);
  }
  if (entry.duration != null) {
    return Math.max(0, entry.duration * 60);
  }
  if (entry.clockIn && entry.clockOut) {
    return Math.max(
      0,
      Math.floor(
        (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 1000,
      ),
    );
  }
  return 0;
}

export function startOfCalendarWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfCalendarWeek(date = new Date()) {
  const end = startOfCalendarWeek(date);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function roundHours(hours: number) {
  return Math.round(hours * 10) / 10;
}

export function splitRegularAndOvertime(totalHours: number, requiredHours: number) {
  const regularHours = Math.min(totalHours, requiredHours);
  const overtimeHours = Math.max(0, totalHours - requiredHours);
  return { regularHours, overtimeHours };
}

export function formatHoursMinutes(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Hours and minutes only (floors seconds) — for breakdown summaries. */
export function formatHoursMinutesFloored(totalSeconds: number): string {
  const totalMinutes = Math.floor(Math.max(0, totalSeconds) / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Precise worked time with seconds (no rounding up to whole minutes). */
export function formatPreciseWorkedTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatPreciseWorkedClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatHoursCompact(hours: number): string {
  return `${roundHours(hours)}h`;
}

export type DailyHoursRow = {
  date: string;
  hours: number;
  regularHours: number;
  overtimeHours: number;
  minutes: number;
};

export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type SessionWorkState = {
  startTime?: Date | string;
  paused?: boolean;
  accumulatedWorkSeconds?: number;
  breakStartedAt?: Date | string | null;
  workSegmentStartedAt?: Date | string | null;
};

/** Work seconds excluding breaks: clock-in → pause, resume → clock-out segments. */
export function computeSessionWorkSeconds(
  state: SessionWorkState,
  now: Date = new Date(),
): number {
  const accumulated = state.accumulatedWorkSeconds ?? 0;
  const hasPauseState =
    state.workSegmentStartedAt != null ||
    !!state.paused ||
    accumulated > 0 ||
    state.breakStartedAt != null;

  if (!hasPauseState && state.startTime) {
    return Math.floor(
      (now.getTime() - new Date(state.startTime).getTime()) / 1000,
    );
  }

  let workSeconds = accumulated;
  if (state.workSegmentStartedAt) {
    workSeconds += Math.floor(
      (now.getTime() - new Date(state.workSegmentStartedAt).getTime()) / 1000,
    );
  }
  return workSeconds;
}

export function isDateInCalendarWeek(dateStr: string, referenceDate = new Date()) {
  const start = localDateKey(startOfCalendarWeek(referenceDate));
  const end = localDateKey(endOfCalendarWeek(referenceDate));
  return dateStr >= start && dateStr <= end;
}

/** Replace server snapshot of active session work with live tick for display. */
export function adjustHoursForLiveSession(
  totalHours: number,
  activeSession: { workSeconds: number } | null | undefined,
  liveWorkSeconds: number,
  includeActive: boolean,
) {
  return workedSecondsFromStats(
    { totalHours, activeSession },
    liveWorkSeconds,
    includeActive,
  ) / 3600;
}

export function workedSecondsFromStats(
  stats: {
    totalSeconds?: number;
    totalHours?: number;
    activeSession?: { workSeconds: number } | null;
  } | null | undefined,
  liveWorkSeconds: number,
  includeLive: boolean,
): number {
  const baseSeconds =
    stats?.totalSeconds ??
    Math.round((stats?.totalHours ?? 0) * 3600);

  if (!includeLive || !stats?.activeSession) {
    return Math.max(0, baseSeconds);
  }

  return Math.max(
    0,
    baseSeconds - stats.activeSession.workSeconds + liveWorkSeconds,
  );
}

export function periodClockInBounds(
  period: "today" | "week" | "month",
  referenceDate = new Date(),
) {
  const start = periodRangeStart(period, referenceDate);
  let end: Date;
  if (period === "today") {
    end = new Date(referenceDate);
    end.setHours(23, 59, 59, 999);
  } else if (period === "week") {
    end = endOfCalendarWeek(referenceDate);
  } else {
    end = new Date(referenceDate);
  }
  return { start, end };
}

/** Local calendar day bounds for filtering time entries (inclusive). */
export function dayBounds(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return {
    start: new Date(y, m - 1, d, 0, 0, 0, 0),
    end: new Date(y, m - 1, d, 23, 59, 59, 999),
  };
}

export function periodRangeStart(
  period: "today" | "week" | "month",
  referenceDate = new Date(),
): Date {
  const start = new Date(referenceDate);
  if (period === "today") {
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (period === "week") {
    return startOfCalendarWeek(referenceDate);
  }
  start.setMonth(start.getMonth() - 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

function emptyDay(dateStr: string): DailyHoursRow {
  return {
    date: dateStr,
    hours: 0,
    regularHours: 0,
    overtimeHours: 0,
    minutes: 0,
  };
}

export function buildDailyBreakdown(
  dailyMinutes: Map<string, number>,
): DailyHoursRow[] {
  return Array.from(dailyMinutes.entries())
    .map(([date, minutes]) => {
      const hours = minutes / 60;
      const { regularHours, overtimeHours } = splitRegularAndOvertime(
        hours,
        REQUIRED_DAILY_HOURS,
      );
      return {
        date,
        minutes,
        hours: roundHours(hours),
        regularHours: roundHours(regularHours),
        overtimeHours: roundHours(overtimeHours),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Pad sparse API rows so chart/list always match the selected period. */
export function fillBreakdownForPeriod(
  rows: DailyHoursRow[],
  period: "today" | "week" | "month",
  referenceDate = new Date(),
): DailyHoursRow[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));

  if (period === "today") {
    const today = localDateKey(referenceDate);
    return [byDate.get(today) ?? emptyDay(today)];
  }

  if (period === "week") {
    const start = startOfCalendarWeek(referenceDate);
    const result: DailyHoursRow[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const key = localDateKey(day);
      result.push(byDate.get(key) ?? emptyDay(key));
    }
    return result;
  }

  const start = periodRangeStart("month", referenceDate);
  const end = new Date(referenceDate);
  end.setHours(0, 0, 0, 0);
  const result: DailyHoursRow[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = localDateKey(cursor);
    result.push(byDate.get(key) ?? emptyDay(key));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

/** Chart rows: month shows only days with logged time so labels align with bars. */
export function chartBreakdownForPeriod(
  rows: DailyHoursRow[],
  period: "today" | "week" | "month",
  referenceDate = new Date(),
): DailyHoursRow[] {
  const filled = fillBreakdownForPeriod(rows, period, referenceDate);
  if (period === "month") {
    return filled.filter((day) => day.hours > 0);
  }
  return filled;
}

export function listBreakdownForPeriod(
  chartRows: DailyHoursRow[],
): DailyHoursRow[] {
  return chartRows
    .filter((day) => day.hours > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function formatPeriodRangeLabel(
  period: BreakdownPeriod,
  referenceDate = new Date(),
): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (period === "week") {
    const start = startOfCalendarWeek(referenceDate);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `Week total (${fmt(start)} – ${fmt(end)})`;
  }
  const start = periodRangeStart("month", referenceDate);
  const end = new Date(referenceDate);
  return `Month total (${fmt(start)} – ${fmt(end)})`;
}

export function periodBreakdownSubtitle(period: BreakdownPeriod): string {
  if (period === "week") {
    return `Current work week (Mon–Sun) · regular up to ${REQUIRED_DAILY_HOURS}h/day`;
  }
  return "Last 30 days · scroll chart to browse each day";
}

export function formatBreakdownAxisLabel(date: string, period: BreakdownPeriod) {
  const d = new Date(`${date}T12:00:00`);
  if (period === "month") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

export function buildTimeStatsSummary(
  totalMinutes: number,
  dailyMinutes: Map<string, number>,
  period: "today" | "week" | "month",
) {
  const totalHours = totalMinutes / 60;
  const dailyBreakdown = buildDailyBreakdown(dailyMinutes);
  const dailyOvertimeHours = roundHours(
    dailyBreakdown.reduce((sum, day) => sum + day.overtimeHours, 0),
  );

  let requiredHours: number | null;
  let regularHours: number;
  let overtimeHours: number;

  if (period === "today") {
    requiredHours = REQUIRED_DAILY_HOURS;
    ({ regularHours, overtimeHours } = splitRegularAndOvertime(
      totalHours,
      REQUIRED_DAILY_HOURS,
    ));
  } else if (period === "week") {
    requiredHours = REQUIRED_WEEKLY_HOURS;
    ({ regularHours, overtimeHours } = splitRegularAndOvertime(
      totalHours,
      REQUIRED_WEEKLY_HOURS,
    ));
  } else {
    requiredHours = null;
    regularHours = roundHours(totalHours);
    overtimeHours = dailyOvertimeHours;
  }

  const daysWorked = dailyBreakdown.length;
  const averageHours = daysWorked > 0 ? roundHours(totalHours / daysWorked) : 0;

  return {
    totalHours: roundHours(totalHours),
    regularHours: roundHours(regularHours),
    overtimeHours: roundHours(overtimeHours),
    dailyOvertimeHours,
    requiredHours,
    requiredWeeklyHours: REQUIRED_WEEKLY_HOURS,
    requiredDailyHours: REQUIRED_DAILY_HOURS,
    averageHours,
    dailyBreakdown,
    period,
  };
}
