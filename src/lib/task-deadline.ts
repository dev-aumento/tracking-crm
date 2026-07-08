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
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function endOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay();
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  x.setDate(x.getDate() + daysUntilSunday);
  return endOfDay(x);
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

  const startNextWeek = new Date(endThisWeek);
  startNextWeek.setDate(startNextWeek.getDate() + 1);
  startNextWeek.setHours(0, 0, 0, 0);
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
  const d = new Date(dueDate);
  return d.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

  const at5pm = (d: Date) => {
    const x = new Date(d);
    x.setHours(17, 0, 0, 0);
    return x.toISOString().slice(0, 10);
  };

  if (columnKey === "overdue") {
    const d = new Date(now);
    d.setDate(d.getDate() - 2);
    return { dueDate: at5pm(d), status: "todo" };
  }

  if (columnKey === "due_today") {
    return { dueDate: at5pm(now), status: "todo" };
  }

  if (columnKey === "due_this_week") {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    return { dueDate: at5pm(d), status: "todo" };
  }

  if (columnKey === "due_next_week") {
    const endThis = endOfWeek(now);
    const d = new Date(endThis);
    d.setDate(d.getDate() + 3);
    return { dueDate: at5pm(d), status: "todo" };
  }

  const d = new Date(now);
  d.setDate(d.getDate() + 21);
  return { dueDate: at5pm(d), status: "todo" };
}
