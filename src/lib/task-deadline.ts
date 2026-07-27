import {
  formatWorkZoneDateTime,
  startOfWorkZoneDay,
  endOfWorkZoneDay,
  workZoneDateKey,
  workZoneDateParts,
  workZoneWallTimeToUtc,
  workZoneWeekday,
} from "@/lib/timezone";

export type DeadlineColumnKey =
  | "overdue"
  | "due_today"
  | "due_this_week"
  | "due_next_week"
  | "no_deadline"
  | "due_over_two_weeks"
  | "completed";

export const DEADLINE_COLUMNS: {
  key: DeadlineColumnKey;
  label: string;
  accentColor: string;
}[] = [
  { key: "overdue", label: "Overdue", accentColor: "#DC2626" },
  { key: "due_today", label: "Due today", accentColor: "#D97706" },
  { key: "due_this_week", label: "Due this week", accentColor: "#3B82F6" },
  { key: "due_next_week", label: "Due next week", accentColor: "#8B5CF6" },
  { key: "no_deadline", label: "No deadline", accentColor: "#9CA3AF" },
  { key: "due_over_two_weeks", label: "Due over two weeks", accentColor: "#64748B" },
  { key: "completed", label: "Completed", accentColor: "#10B981" },
];

type TaskLike = {
  status: string;
  dueDate?: string | Date | null;
};

function startOfDay(d: Date) {
  return startOfWorkZoneDay(d);
}

function endOfDay(d: Date) {
  return endOfWorkZoneDay(d);
}

/** Sunday end of the IST week containing `d` (week ends Sunday). */
function endOfWeek(d: Date) {
  const { year, month, day } = workZoneDateParts(d);
  const weekday = workZoneWeekday(d);
  const daysUntilSunday = weekday === 0 ? 0 : 7 - weekday;
  return workZoneWallTimeToUtc(year, month, day + daysUntilSunday, 23, 59, 59, 999);
}

function istDateKeyOffset(from: Date, dayOffset: number) {
  const { year, month, day } = workZoneDateParts(from);
  return workZoneDateKey(workZoneWallTimeToUtc(year, month, day + dayOffset, 12));
}

export function getDeadlineColumn(task: TaskLike): DeadlineColumnKey {
  if (task.status === "done") return "completed";
  if (!task.dueDate) return "no_deadline";

  const due = startOfDay(new Date(task.dueDate));
  const today = startOfDay(new Date());
  const endToday = endOfDay(new Date());
  const endThisWeek = endOfWeek(new Date());

  if (due < today) return "overdue";
  if (due <= endToday) return "due_today";
  if (due <= endThisWeek) return "due_this_week";

  const endParts = workZoneDateParts(endThisWeek);
  const startNextWeek = workZoneWallTimeToUtc(
    endParts.year,
    endParts.month,
    endParts.day + 1,
    0,
    0,
    0,
    0,
  );
  const endNextWeek = endOfWeek(startNextWeek);

  if (due <= endNextWeek) return "due_next_week";
  return "due_over_two_weeks";
}

export function groupTasksByDeadline<T extends TaskLike>(tasks: T[]) {
  const groups: Record<DeadlineColumnKey, T[]> = {
    overdue: [],
    due_today: [],
    due_this_week: [],
    due_next_week: [],
    no_deadline: [],
    due_over_two_weeks: [],
    completed: [],
  };

  for (const task of tasks) {
    groups[getDeadlineColumn(task)].push(task);
  }

  return groups;
}

/** Past due — show red border on task cards. */
export function isTaskOverdue(task: TaskLike) {
  return getDeadlineColumn(task) === "overdue";
}

/** Due today or within the next day — approaching deadline. */
export function isTaskAlmostOverdue(task: TaskLike) {
  if (task.status === "done") return false;
  const column = getDeadlineColumn(task);
  if (column === "due_today") return true;
  if (!task.dueDate) return false;
  const due = startOfDay(new Date(task.dueDate));
  const today = startOfDay(new Date());
  const diffDays = Math.floor((due.getTime() - today.getTime()) / 86400000);
  return diffDays >= 0 && diffDays <= 1;
}

/** Due today — show amber border on task cards. */
export function isTaskDueToday(task: TaskLike) {
  return getDeadlineColumn(task) === "due_today";
}

/** @deprecated Use isTaskOverdue — red styling is for overdue only. */
export function isTaskDueAlert(task: TaskLike) {
  return isTaskOverdue(task);
}

export function formatDueLabel(dueDate: string | Date) {
  return formatWorkZoneDateTime(dueDate, {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Default new-task deadline: same calendar day in IST at 7:00 PM. */
export function defaultTaskDeadlineIso(from: Date | string = new Date()): string {
  const { year, month, day } = workZoneDateParts(from);
  return workZoneWallTimeToUtc(year, month, day, 19, 0, 0, 0).toISOString();
}

export function formatOverdueLabel(dueDate: string | Date) {
  const due = startOfDay(new Date(dueDate));
  const today = startOfDay(new Date());
  const diffDays = Math.floor((today.getTime() - due.getTime()) / 86400000);
  if (diffDays < 7) {
    return `Overdue ${diffDays} day${diffDays === 1 ? "" : "s"}`;
  }
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) {
    return `Overdue ${diffWeeks} week${diffWeeks === 1 ? "" : "s"}`;
  }
  const diffMonths = Math.max(1, Math.floor(diffDays / 30));
  return `Overdue ${diffMonths} month${diffMonths === 1 ? "" : "s"}`;
}

export function weeksOverdue(dueDate: string | Date) {
  const due = startOfDay(new Date(dueDate));
  const today = startOfDay(new Date());
  const diffDays = Math.floor((today.getTime() - due.getTime()) / 86400000);
  return Math.max(1, Math.ceil(diffDays / 7));
}

export function trackedSecondsFromHours(actualHours?: string | null) {
  const h = parseFloat(actualHours ?? "0");
  if (Number.isNaN(h)) return 0;
  return Math.round(h * 3600);
}

/** Map a deadline column drop target to task field updates. */
export function deadlineColumnToTaskUpdate(columnKey: DeadlineColumnKey): {
  dueDate: string | null;
  status?: "todo" | "in_progress" | "review" | "done";
} {
  const now = new Date();

  if (columnKey === "completed") {
    return { dueDate: null, status: "done" };
  }

  if (columnKey === "no_deadline") {
    return { dueDate: null, status: "todo" };
  }

  if (columnKey === "overdue") {
    return { dueDate: istDateKeyOffset(now, -2), status: "todo" };
  }

  if (columnKey === "due_today") {
    return { dueDate: istDateKeyOffset(now, 0), status: "todo" };
  }

  if (columnKey === "due_this_week") {
    return { dueDate: istDateKeyOffset(now, 2), status: "todo" };
  }

  if (columnKey === "due_next_week") {
    const endThis = endOfWeek(now);
    const parts = workZoneDateParts(endThis);
    return {
      dueDate: workZoneDateKey(
        workZoneWallTimeToUtc(parts.year, parts.month, parts.day + 3, 12),
      ),
      status: "todo",
    };
  }

  return { dueDate: istDateKeyOffset(now, 21), status: "todo" };
}
