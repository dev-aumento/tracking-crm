import { DEV_USER } from "./dev-mode";
import type { SafeUser } from "../queries/users";
import { buildTimeStatsSummary, localDateKey, startOfCalendarWeek, computeSessionWorkSeconds, periodClockInBounds, dayBounds, roundHours, attendanceEntrySeconds } from "@/lib/work-hours-policy";
import {
  projectPerformancePercent,
} from "@/lib/project-funnel";
import { legacyStatusToStage } from "@/lib/task-kanban";
import { taskMatchesUnifiedSearch } from "@/lib/unified-search";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function atDayTime(daysBack: number, hours: number, minutes: number) {
  const d = daysAgo(daysBack);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

const users: SafeUser[] = [
  DEV_USER,
  {
    id: 2,
    unionId: "manager_union_001",
    name: "Sarah Chen",
    email: "sarah@aumento.io",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah",
    role: "manager",
    status: "active",
    department: "Engineering",
    position: "Engineering Lead",
    phone: "+1-555-0102",
    createdAt: daysAgo(90),
    updatedAt: daysAgo(1),
    lastSignInAt: daysAgo(0),
  },
  {
    id: 4,
    unionId: "emp_union_001",
    name: "Emily Rodriguez",
    email: "emily@aumento.io",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Emily",
    role: "employee",
    status: "active",
    department: "Engineering",
    position: "Frontend Developer",
    phone: "+1-555-0104",
    createdAt: daysAgo(60),
    updatedAt: daysAgo(2),
    lastSignInAt: daysAgo(0),
  },
];

function userById(id: number) {
  return users.find((u) => u.id === id) ?? null;
}

const projects = [
  {
    id: 1,
    name: "Website Redesign",
    description: "Complete overhaul of the company website with modern design.",
    status: "active" as const,
    color: "#2563EB",
    createdBy: 1,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(2),
    taskCount: 4,
    completedCount: 1,
    creator: DEV_USER,
  },
  {
    id: 2,
    name: "Mobile App v2",
    description: "Second version of the mobile app with offline support.",
    status: "active" as const,
    color: "#3B82F6",
    createdBy: 2,
    createdAt: daysAgo(20),
    updatedAt: daysAgo(1),
    taskCount: 2,
    completedCount: 0,
    creator: users[1],
  },
  {
    id: 3,
    name: "AGPL Website Refresh",
    description: "Refresh public website content and branding for AGPL.",
    status: "active" as const,
    color: "#10B981",
    createdBy: 1,
    createdAt: daysAgo(45),
    updatedAt: daysAgo(0),
    taskCount: 0,
    completedCount: 0,
    creator: DEV_USER,
  },
  {
    id: 4,
    name: "AI — CyperX",
    description: "AI integration and automation for CyperX platform.",
    status: "active" as const,
    color: "#8B5CF6",
    createdBy: 2,
    createdAt: daysAgo(60),
    updatedAt: daysAgo(3),
    taskCount: 0,
    completedCount: 0,
    creator: users[1],
  },
  {
    id: 5,
    name: "Client Portal v3",
    description: "Self-service portal for enterprise clients.",
    status: "active" as const,
    color: "#F59E0B",
    createdBy: 1,
    createdAt: daysAgo(15),
    updatedAt: daysAgo(5),
    taskCount: 0,
    completedCount: 0,
    creator: DEV_USER,
  },
  {
    id: 6,
    name: "Internal HR Tools",
    description: "HR onboarding and leave management modules.",
    status: "archived" as const,
    color: "#6B7280",
    createdBy: 2,
    createdAt: daysAgo(120),
    updatedAt: daysAgo(30),
    taskCount: 0,
    completedCount: 0,
    creator: users[1],
  },
];

const projectMemberKeys = new Set<string>();

function mockMemberKey(projectId: number, userId: number) {
  return `${projectId}:${userId}`;
}

function mockIsProjectMember(
  projectId: number,
  userId: number,
  createdBy?: number | null,
) {
  if (createdBy != null && createdBy === userId) return true;
  return projectMemberKeys.has(mockMemberKey(projectId, userId));
}

function mockCanViewProjectTasks(
  user: SafeUser,
  projectCreatedBy: number | null | undefined,
  joined: boolean,
) {
  if (user.role === "admin" || user.role === "manager") return true;

  if (user.role === "employee") {
    if (projectCreatedBy != null && projectCreatedBy === user.id) return true;
    return joined;
  }

  if (user.permissions?.includes("projects.manage")) return true;
  if (user.permissions?.includes("tasks.view_all")) return true;
  if (projectCreatedBy != null && projectCreatedBy === user.id) return true;
  return joined;
}

const tasks = [
  {
    id: 1,
    title: "Design homepage hero section",
    description: "Create wireframes and high-fidelity mockups for the new homepage hero.",
    status: "in_progress" as const,
    stage: "in_designing" as const,
    priority: "high" as const,
    assigneeId: 1,
    projectId: 1,
    createdBy: 2,
    dueDate: daysFromNow(-5),
    estimatedHours: "8.00",
    actualHours: "3.50",
    position: 0,
    createdAt: daysAgo(10),
    updatedAt: daysAgo(1),
    assignee: DEV_USER,
  },
  {
    id: 2,
    title: "Implement authentication flow",
    description: "Add login, logout, and session handling.",
    status: "review" as const,
    stage: "in_qa_1st_round" as const,
    priority: "urgent" as const,
    assigneeId: 1,
    projectId: 2,
    createdBy: 1,
    dueDate: daysFromNow(0),
    estimatedHours: "12.00",
    actualHours: "10.00",
    position: 1,
    createdAt: daysAgo(14),
    updatedAt: daysAgo(0),
    assignee: DEV_USER,
  },
  {
    id: 3,
    title: "Write API documentation",
    description: "Document all REST and tRPC endpoints for the team.",
    status: "todo" as const,
    stage: "new" as const,
    priority: "medium" as const,
    assigneeId: 1,
    projectId: 1,
    createdBy: 2,
    dueDate: daysFromNow(3),
    estimatedHours: "6.00",
    actualHours: "0.00",
    position: 2,
    createdAt: daysAgo(5),
    updatedAt: daysAgo(5),
    assignee: DEV_USER,
  },
  {
    id: 4,
    title: "Set up CI/CD pipeline",
    description: "Configure GitHub Actions for automated testing and deployment.",
    status: "done" as const,
    stage: "finished" as const,
    priority: "low" as const,
    assigneeId: 1,
    projectId: 1,
    createdBy: 1,
    dueDate: daysFromNow(-3),
    estimatedHours: "4.00",
    actualHours: "4.00",
    position: 3,
    createdAt: daysAgo(20),
    updatedAt: daysAgo(3),
    assignee: DEV_USER,
  },
  {
    id: 5,
    title: "User research interviews",
    description: "Conduct 5 user interviews for the mobile app redesign.",
    status: "in_progress" as const,
    stage: "in_developing" as const,
    priority: "medium" as const,
    assigneeId: 4,
    projectId: 2,
    createdBy: 2,
    dueDate: daysFromNow(7),
    estimatedHours: "10.00",
    actualHours: "2.00",
    position: 4,
    createdAt: daysAgo(7),
    updatedAt: daysAgo(2),
    assignee: users[2],
  },
  {
    id: 6,
    title: "Update brand guidelines",
    description: "Refresh color palette and typography docs.",
    status: "todo" as const,
    stage: "backlog" as const,
    priority: "low" as const,
    assigneeId: 1,
    projectId: 1,
    createdBy: 1,
    dueDate: null,
    estimatedHours: "4.00",
    actualHours: "0.00",
    position: 5,
    createdAt: daysAgo(3),
    updatedAt: daysAgo(3),
    assignee: DEV_USER,
  },
  {
    id: 7,
    title: "Q4 planning workshop",
    description: "Schedule and prepare materials for quarterly planning.",
    status: "todo" as const,
    stage: "client_1st_round" as const,
    priority: "medium" as const,
    assigneeId: 1,
    projectId: 2,
    createdBy: 2,
    dueDate: daysFromNow(21),
    estimatedHours: "8.00",
    actualHours: "1.50",
    position: 6,
    createdAt: daysAgo(2),
    updatedAt: daysAgo(1),
    assignee: DEV_USER,
  },
];

const notifications = [
  {
    id: 1,
    userId: 1,
    taskId: 1,
    type: "task_assigned" as const,
    title: "New task assigned",
    message: "Sarah Chen assigned you to Design homepage hero section",
    read: false,
    link: "/tasks?task=1",
    createdAt: daysAgo(1),
  },
  {
    id: 2,
    userId: 1,
    taskId: 2,
    type: "task_updated" as const,
    title: "Task moved to review",
    message: "Implement authentication flow is ready for review",
    read: false,
    link: "/tasks?task=2",
    createdAt: daysAgo(0),
  },
  {
    id: 3,
    userId: 1,
    taskId: 1,
    type: "mention" as const,
    title: "New comment on task",
    message: "Sarah Chen: Can we try a bolder hero layout?",
    read: false,
    link: "/tasks?task=1&view=chats",
    createdAt: daysAgo(0),
  },
  {
    id: 4,
    userId: 1,
    taskId: 2,
    type: "mention" as const,
    title: "New comment on task",
    message: "Emily Rodriguez: Auth flow looks good, minor tweaks needed",
    read: false,
    link: "/tasks?task=2&view=chats",
    createdAt: daysAgo(0),
  },
  {
    id: 5,
    userId: 1,
    taskId: 3,
    type: "deadline_reminder" as const,
    title: "Task chat update",
    message: "New activity on Write API documentation",
    read: false,
    link: "/tasks?task=3&view=chats",
    createdAt: daysAgo(0),
  },
  {
    id: 6,
    userId: 1,
    taskId: 7,
    type: "task_updated" as const,
    title: "Task chat update",
    message: "Planning workshop materials were uploaded",
    read: false,
    link: "/tasks?task=7&view=chats",
    createdAt: daysAgo(1),
  },
  {
    id: 7,
    userId: 1,
    type: "task_updated" as const,
    title: "Weekly summary",
    message: "You completed 3 tasks this week. Great work!",
    read: true,
    link: "/",
    createdAt: daysAgo(2),
  },
];

export function mockDashboardStats(userId: number) {
  const userTasks = tasks.filter((t) => t.assigneeId === userId);
  const ongoing = userTasks.filter((t) => t.status === "in_progress").length;
  const completed = userTasks.filter((t) => t.status === "done").length;
  const total = userTasks.length || 1;
  const done = userTasks.filter((t) => t.status === "done").length;
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const weekMinutes = allUserTimeEntries(userId)
    .filter((e) => e.clockOut && e.clockIn >= weekAgo)
    .reduce((sum, e) => sum + (e.duration ?? 0), 0);

  return {
    ongoingTasks: ongoing,
    completedTasks: completed,
    hoursTracked: Math.round((weekMinutes / 60) * 10) / 10,
    teamPerformance: Math.round((done / total) * 100),
  };
}

export function mockRecentTasks(userId: number, limit = 10) {
  return tasks
    .filter((t) => t.assigneeId === userId)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, limit);
}

export function mockWeeklyActivity() {
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => ({
    day,
    completed: [2, 1, 3, 0, 2, 1, 0][i],
    created: [1, 2, 1, 2, 0, 1, 0][i],
  }));
}

export function mockWorkload() {
  return users.map((user) => {
    const totalMinutes = allUserTimeEntries(user.id)
      .filter((e) => e.clockOut)
      .reduce((sum, e) => sum + (e.duration ?? 0), 0);
    return {
      userId: user.id,
      name: user.name || "Unknown",
      avatar: user.avatar,
      role: user.role,
      taskCount: tasks.filter((t) => t.assigneeId === user.id && t.status === "in_progress").length,
      hoursLogged: Math.round((totalMinutes / 60) * 10) / 10,
    };
  });
}

export function mockTaskList(
  input?: {
    status?: string;
    priority?: string;
    assigneeId?: number;
    projectId?: number;
    search?: string;
    limit?: number;
  },
  currentUser?: SafeUser,
) {
  let result = [...tasks];
  if (input?.status) result = result.filter((t) => t.status === input.status);
  if (input?.priority) result = result.filter((t) => t.priority === input.priority);
  if (input?.assigneeId) result = result.filter((t) => t.assigneeId === input.assigneeId);
  if (input?.projectId) {
    const project = projects.find((p) => p.id === input.projectId);
    const user = currentUser ?? DEV_USER;
    const joined = project
      ? mockIsProjectMember(project.id, user.id, project.createdBy)
      : false;
    if (project && !mockCanViewProjectTasks(user, project.createdBy, joined)) {
      return { tasks: [], total: 0 };
    }
    result = result.filter((t) => t.projectId === input.projectId);
  }
  if (input?.search) {
    const ctx = {
      users,
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
    };
    result = result.filter((t) => taskMatchesUnifiedSearch(t, input.search!, ctx));
  }
  const limit = input?.limit ?? 50;
  return {
    tasks: result.slice(0, limit).map((t) => {
      const project = t.projectId ? projects.find((p) => p.id === t.projectId) : null;
      return {
        ...t,
        creator: t.createdBy ? userById(t.createdBy) ?? null : null,
        project: project
          ? { id: project.id, name: project.name, color: project.color }
          : null,
        participantIds: (taskParticipants[t.id] ?? []).map((p) => p.id),
        observerIds: (taskObservers[t.id] ?? []).map((p) => p.id),
      };
    }),
    total: result.length,
  };
}

const taskParticipants: Record<number, SafeUser[]> = {
  1: [],
  2: [users[1], users[2]],
};

const taskObservers: Record<number, SafeUser[]> = {
  1: [users[1]!],
  5: [DEV_USER],
};

const taskSubtasks: Record<number, Array<{
  id: number;
  taskId: number;
  title: string;
  completed: boolean;
  position: number;
  createdAt: Date;
}>> = {
  1: [
    { id: 1, taskId: 1, title: "Research competitors", completed: true, position: 0, createdAt: daysAgo(8) },
    { id: 2, taskId: 1, title: "Create mockups", completed: false, position: 1, createdAt: daysAgo(5) },
  ],
};

const taskAttachments: Record<number, Array<{
  id: number;
  taskId: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  dataBase64: string;
  uploadedBy: number;
  createdAt: Date;
}>> = {};

const taskActivities: Record<number, Array<{
  id: number;
  taskId: number;
  userId: number | null;
  action: "created" | "updated" | "status_changed" | "assigned" | "commented" | "time_logged" | "subtask_completed" | "tag_added" | "participant_added" | "observer_added";
  oldValue: string | null;
  newValue: string | null;
  metadata: unknown;
  createdAt: Date;
  user: SafeUser | null;
}>> = {
  1: [
    { id: 1, taskId: 1, userId: 2, action: "created", oldValue: null, newValue: "Design homepage hero section", metadata: null, createdAt: daysAgo(10), user: users[1] },
    { id: 2, taskId: 1, userId: 2, action: "assigned", oldValue: "Jenish Radadiya", newValue: "Alex Morgan", metadata: null, createdAt: daysAgo(8), user: users[1] },
    { id: 3, taskId: 1, userId: 1, action: "time_logged", oldValue: null, newValue: "19 minutes", metadata: null, createdAt: daysAgo(3), user: DEV_USER },
    { id: 4, taskId: 1, userId: 2, action: "commented", oldValue: null, newValue: "Can we try a bolder hero layout?", metadata: null, createdAt: daysAgo(0), user: users[1] },
  ],
  2: [
    { id: 5, taskId: 2, userId: 1, action: "created", oldValue: null, newValue: "Implement authentication flow", metadata: null, createdAt: daysAgo(14), user: DEV_USER },
    { id: 6, taskId: 2, userId: 4, action: "commented", oldValue: null, newValue: "Auth flow looks good, minor tweaks needed", metadata: null, createdAt: daysAgo(0), user: users[2] },
    { id: 7, taskId: 2, userId: 1, action: "status_changed", oldValue: "in_progress", newValue: "review", metadata: null, createdAt: daysAgo(1), user: DEV_USER },
  ],
};

const taskTimeEntries: Record<number, Array<{
  id: number;
  userId: number;
  taskId: number;
  clockIn: Date;
  clockOut: Date | null;
  duration: number | null;
  note: string | null;
  user: SafeUser;
}>> = {
  1: (() => {
    const start1 = atDayTime(5, 10, 0);
    const end1 = new Date(start1.getTime() + 19 * 60_000);
    const start2 = atDayTime(3, 14, 30);
    const end2 = new Date(start2.getTime() + 19 * 60_000);
    const start3 = atDayTime(2, 9, 0);
    const end3 = new Date(start3.getTime() + 90 * 60_000);
    return [
      { id: 101, userId: 1, taskId: 1, clockIn: start1, clockOut: end1, duration: 19, note: "Wireframes and layout", user: DEV_USER },
      { id: 102, userId: 1, taskId: 1, clockIn: start2, clockOut: end2, duration: 19, note: "Quick review session", user: DEV_USER },
      { id: 103, userId: 2, taskId: 1, clockIn: start3, clockOut: end3, duration: 90, note: "Design feedback", user: users[1]! },
    ];
  })(),
  2: (() => {
    const start = atDayTime(4, 11, 15);
    const end = new Date(start.getTime() + 360 * 60_000);
    return [
      { id: 201, userId: 1, taskId: 2, clockIn: start, clockOut: end, duration: 360, note: "Auth implementation", user: DEV_USER },
    ];
  })(),
};

type MockWorkEntry = {
  id: number;
  userId: number;
  taskId: number | null;
  projectId: number | null;
  clockIn: Date;
  clockOut: Date | null;
  duration: number | null;
  durationSeconds: number | null;
  note: string | null;
  source: "web" | "mobile" | "manual";
  createdAt: Date;
  updatedAt: Date;
};

let nextWorkEntryId = 1000;

type MockWorkSession = {
  id: number;
  userId: number;
  startTime: Date;
  endTime: Date | null;
  active: boolean;
  paused: boolean;
  accumulatedWorkSeconds: number;
  workSegmentStartedAt: Date | null;
  breakStartedAt: Date | null;
};

const workSessionsByUser: Record<number, MockWorkSession> = {};

type MockWorkBreak = {
  id: number;
  userId: number;
  workSessionId: number;
  timeEntryId: number | null;
  startTime: Date;
  endTime: Date | null;
  reason: string | null;
  manuallyEdited: boolean;
  createdAt: Date;
  updatedAt: Date;
};

let nextWorkBreakId = 5000;
const workBreaksByUser: Record<number, MockWorkBreak[]> = {};

type MockTimeApprovalRequest = {
  id: number;
  userId: number;
  type: "clock_in" | "break";
  status: "pending" | "approved" | "rejected";
  reason: string;
  workSessionId: number | null;
  timeEntryId: number | null;
  workBreakId: number | null;
  originalClockIn: Date | null;
  originalBreakStart: Date | null;
  originalBreakEnd: Date | null;
  requestedClockIn: Date | null;
  requestedBreakStart: Date | null;
  requestedBreakEnd: Date | null;
  reviewedBy: number | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};

let nextApprovalId = 9000;
const timeApprovalRequests: MockTimeApprovalRequest[] = [];

function mockNotifyAdmins(actor: SafeUser, title: string, message: string, approvalRequestId: number) {
  const admin = users.find((u) => u.role === "admin");
  if (!admin || admin.id === actor.id) return;
  notifications.unshift({
    id: Date.now() + Math.random(),
    userId: admin.id,
    actorId: actor.id,
    taskId: null,
    type: "time_approval_pending",
    title,
    message,
    approvalRequestId,
    read: false,
    createdAt: new Date(),
  } as (typeof notifications)[number] & { approvalRequestId: number; actorId: number });
}

function mockActorLabel(actor: SafeUser) {
  return actor.name || actor.email || "Someone";
}

function mockNotifyTaskMembers({
  taskId,
  actor,
  type,
  title,
  message,
  extraRecipientIds = [],
  excludeUserIds = [],
}: {
  taskId: number;
  actor: SafeUser;
  type: (typeof notifications)[number]["type"];
  title: string;
  message: string;
  extraRecipientIds?: number[];
  excludeUserIds?: number[];
}) {
  const task = tasks.find((t) => t.id === taskId);
  const excluded = new Set([actor.id, ...excludeUserIds]);
  const recipientIds = new Set<number>();
  if (task?.assigneeId != null) recipientIds.add(task.assigneeId);
  for (const participant of taskParticipants[taskId] ?? []) {
    recipientIds.add(participant.id);
  }
  for (const id of extraRecipientIds) recipientIds.add(id);

  const recipients = [...recipientIds].filter((id) => !excluded.has(id));
  if (recipients.length === 0) return;

  const now = new Date();
  for (const userId of recipients) {
    notifications.unshift({
      id: Date.now() + Math.floor(Math.random() * 10_000),
      userId,
      actorId: actor.id,
      taskId,
      type,
      title,
      message,
      read: false,
      link: `/tasks?task=${taskId}`,
      createdAt: now,
    } as (typeof notifications)[number] & { actorId: number });
  }
}

function mockApplyClockInApproval(
  request: MockTimeApprovalRequest,
  session: MockWorkSession,
  entry: MockWorkEntry | undefined,
) {
  if (!request.requestedClockIn || !request.originalClockIn) return;
  const deltaSeconds = Math.floor(
    (request.originalClockIn.getTime() - request.requestedClockIn.getTime()) / 1000,
  );
  session.startTime = request.requestedClockIn;
  session.accumulatedWorkSeconds += deltaSeconds;
  if (entry) entry.clockIn = request.requestedClockIn;
}

function workSessionTiming(session: MockWorkSession) {
  const workElapsedSeconds = computeSessionWorkSeconds({
    ...session,
    startTime: session.startTime,
  });
  const breakElapsedSeconds = session.breakStartedAt
    ? Math.floor((Date.now() - session.breakStartedAt.getTime()) / 1000)
    : 0;
  return { workElapsedSeconds, breakElapsedSeconds };
}

export function mockWorkSessionView(session: MockWorkSession) {
  const { workElapsedSeconds, breakElapsedSeconds } = workSessionTiming(session);
  const priorDayWorkSeconds = mockPriorDayWorkSeconds(session.userId, session.startTime);
  return {
    id: session.id,
    userId: session.userId,
    startTime: session.startTime,
    endTime: session.endTime,
    active: session.active,
    paused: session.paused,
    workElapsedSeconds,
    breakElapsedSeconds,
    priorDayWorkSeconds,
  };
}

function mockPriorDayWorkSeconds(userId: number, sessionStart: Date) {
  const dateStr = localDateKey(sessionStart);
  const { start, end } = dayBounds(dateStr);
  return userWorkEntries
    .filter(
      (e) =>
        e.userId === userId &&
        e.taskId == null &&
        e.clockOut &&
        e.clockIn >= start &&
        e.clockIn <= end,
    )
    .reduce((sum, entry) => sum + attendanceEntrySeconds(entry), 0);
}

const userWorkEntries: MockWorkEntry[] = [
  {
    id: 1,
    userId: 1,
    taskId: null,
    projectId: null,
    clockIn: daysAgo(1),
    clockOut: new Date(daysAgo(1).getTime() + 4 * 3600000),
    duration: 240,
    durationSeconds: 240 * 60,
    note: "Homepage design work",
    source: "web",
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
  },
];

function periodStart(period: "today" | "week" | "month") {
  const now = new Date();
  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (period === "week") {
    return startOfCalendarWeek(now);
  }
  const start = new Date(now);
  start.setMonth(start.getMonth() - 1);
  return start;
}

function allUserTimeEntries(userId: number): MockWorkEntry[] {
  const general = userWorkEntries.filter((e) => e.userId === userId);
  const fromTasks: MockWorkEntry[] = [];

  for (const [taskIdStr, entries] of Object.entries(taskTimeEntries)) {
    const taskId = Number(taskIdStr);
    const projectId = tasks.find((t) => t.id === taskId)?.projectId ?? null;
    for (const e of entries) {
      if (e.userId !== userId || !e.clockOut) continue;
      fromTasks.push({
        id: e.id,
        userId: e.userId,
        taskId,
        projectId,
        clockIn: e.clockIn,
        clockOut: e.clockOut,
        duration: e.duration ?? Math.max(
          1,
          Math.floor((e.clockOut.getTime() - e.clockIn.getTime()) / 60000),
        ),
        durationSeconds: null,
        note: e.note,
        source: "web",
        createdAt: e.clockIn,
        updatedAt: e.clockOut,
      });
    }
  }

  return [...general, ...fromTasks].sort(
    (a, b) => b.clockIn.getTime() - a.clockIn.getTime(),
  );
}

export function mockTaskById(id: number) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return null;
  const project = projects.find((p) => p.id === task.projectId) ?? null;
  return {
    ...task,
    project,
    creator: userById(task.createdBy ?? 1),
    subtasks: [...(taskSubtasks[id] ?? [])],
    attachments: [...(taskAttachments[id] ?? [])].map(({ dataBase64: _data, ...meta }) => meta),
    participants: taskParticipants[id] ?? [],
    observers: taskObservers[id] ?? [],
    activities: (taskActivities[id] ?? []).map((a) => ({ ...a })),
  };
}

export function mockTaskTimeTracked(taskId: number) {
  const entries = (taskTimeEntries[taskId] ?? []).map((e) => {
    const durationSeconds = e.clockIn && e.clockOut
      ? Math.max(0, Math.floor((e.clockOut.getTime() - e.clockIn.getTime()) / 1000))
      : (e.duration ?? 0) * 60;
    return { ...e, durationSeconds };
  });
  const totalSeconds = entries.reduce((sum, e) => sum + e.durationSeconds, 0);
  return {
    totalMinutes: Math.round(totalSeconds / 60),
    totalSeconds,
    entries,
  };
}

export function mockUpdateTaskTimeEntry(
  actor: SafeUser,
  input: {
    taskId: number;
    entryId: number;
    clockIn: string;
    clockOut: string;
    reason: string;
  },
) {
  const list = taskTimeEntries[input.taskId];
  if (!list) throw new Error("Time entry not found");
  const entry = list.find((e) => e.id === input.entryId);
  if (!entry) throw new Error("Time entry not found");
  if (!entry.clockOut) throw new Error("Cannot edit an active timer session");

  const clockIn = new Date(input.clockIn);
  const clockOut = new Date(input.clockOut);
  if (clockOut <= clockIn) throw new Error("End time must be after start time");

  entry.clockIn = clockIn;
  entry.clockOut = clockOut;
  entry.duration = Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000);
  const noteSuffix = `(edited: ${input.reason.trim()})`;
  entry.note = entry.note ? `${entry.note} ${noteSuffix}` : noteSuffix;

  const activities = taskActivities[input.taskId] ?? (taskActivities[input.taskId] = []);
  activities.unshift({
    id: Date.now(),
    taskId: input.taskId,
    userId: actor.id,
    action: "time_logged",
    oldValue: null,
    newValue: `Time entry edited — ${entry.duration} min`,
    metadata: { entryId: input.entryId, reason: input.reason.trim() },
    createdAt: new Date(),
    user: actor,
  });

  const task = tasks.find((t) => t.id === input.taskId);
  mockNotifyTaskMembers({
    taskId: input.taskId,
    actor,
    type: "task_updated",
    title: "Time entry updated",
    message: `${mockActorLabel(actor)} edited time logged on "${task?.title ?? "a task"}"`,
  });

  return entry;
}

export function mockAddManualTaskTimeEntry(
  actor: SafeUser,
  input: {
    taskId: number;
    userId?: number;
    clockIn: string;
    clockOut: string;
    note?: string;
  },
) {
  const userId = input.userId ?? actor.id;
  const clockIn = new Date(input.clockIn);
  const clockOut = new Date(input.clockOut);
  if (clockOut <= clockIn) throw new Error("End time must be after start time");

  const duration = Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000);
  const list = taskTimeEntries[input.taskId] ?? (taskTimeEntries[input.taskId] = []);
  const entry = {
    id: Date.now(),
    userId,
    taskId: input.taskId,
    clockIn,
    clockOut,
    duration,
    note: input.note?.trim() || "Manual entry",
    user: userById(userId),
  };
  list.unshift(entry);

  const task = tasks.find((t) => t.id === input.taskId);
  if (task) {
    const currentHours = parseFloat(task.actualHours ?? "0");
    task.actualHours = (currentHours + duration / 60).toFixed(2);
  }

  const activities = taskActivities[input.taskId] ?? (taskActivities[input.taskId] = []);
  activities.unshift({
    id: Date.now() + 1,
    taskId: input.taskId,
    userId: actor.id,
    action: "time_logged",
    oldValue: null,
    newValue: `Manual time added — ${duration} min`,
    metadata: { entryId: entry.id, targetUserId: userId },
    createdAt: new Date(),
    user: actor,
  });

  mockNotifyTaskMembers({
    taskId: input.taskId,
    actor,
    type: "task_updated",
    title: "Time logged",
    message: `${mockActorLabel(actor)} added ${duration} min of time on "${task?.title ?? "a task"}"`,
  });

  return entry;
}

const activeTaskTimers: Record<number, {
  userId: number;
  taskId: number;
  clockIn: Date | null;
  paused: boolean;
  accumulatedSeconds: number;
}> = {};

function timerElapsedSeconds(active: NonNullable<typeof activeTaskTimers[number]>) {
  const running = active.clockIn
    ? Math.floor((Date.now() - active.clockIn.getTime()) / 1000)
    : 0;
  return active.accumulatedSeconds + running;
}

function persistTaskTimeEntry(
  taskId: number,
  userId: number,
  actor: SafeUser,
  totalSeconds: number,
  note = "Task timer",
) {
  if (totalSeconds < 1) return 0;

  const durationMinutes = Math.max(1, Math.ceil(totalSeconds / 60));
  const list = taskTimeEntries[taskId] ?? (taskTimeEntries[taskId] = []);
  const clockOut = new Date();
  const clockIn = new Date(clockOut.getTime() - totalSeconds * 1000);
  list.unshift({
    id: Date.now(),
    userId,
    taskId,
    clockIn,
    clockOut,
    duration: durationMinutes,
    note,
    user: actor,
  });

  const task = tasks.find((t) => t.id === taskId);
  if (task) {
    const currentHours = parseFloat(task.actualHours ?? "0");
    task.actualHours = (currentHours + totalSeconds / 3600).toFixed(2);
  }

  const activities = taskActivities[taskId] ?? (taskActivities[taskId] = []);
  activities.unshift({
    id: Date.now() + 1,
    taskId,
    userId: actor.id,
    action: "time_logged",
    oldValue: null,
    newValue: `${durationMinutes} minutes`,
    metadata: null,
    createdAt: new Date(),
    user: actor,
  });

  return durationMinutes;
}

export function mockGetActiveTaskTimer(userId: number, taskId?: number) {
  const active = activeTaskTimers[userId];
  if (!active) return null;
  if (taskId !== undefined && active.taskId !== taskId) return null;
  return {
    taskId: active.taskId,
    startedAt: active.clockIn,
    paused: active.paused,
    accumulatedSeconds: active.accumulatedSeconds,
    elapsedSeconds: timerElapsedSeconds(active),
  };
}

export function mockStartTaskTimer(userId: number, taskId: number, actor: SafeUser) {
  const task = tasks.find((t) => t.id === taskId);
  const label = mockActorLabel(actor);
  const taskTitle = task?.title ?? "a task";

  const existing = activeTaskTimers[userId];
  if (existing?.taskId === taskId && existing.paused) {
    existing.paused = false;
    existing.clockIn = new Date();
    const list = taskActivities[taskId] ?? (taskActivities[taskId] = []);
    list.unshift({
      id: Date.now(),
      taskId,
      userId: actor.id,
      action: "time_logged",
      oldValue: null,
      newValue: "resumed timer",
      metadata: null,
      createdAt: new Date(),
      user: actor,
    });
    mockNotifyTaskMembers({
      taskId,
      actor,
      type: "task_updated",
      title: "Timer started",
      message: `${label} resumed the timer on "${taskTitle}"`,
    });
    return { taskId, startedAt: existing.clockIn, resumed: true };
  }

  activeTaskTimers[userId] = {
    userId,
    taskId,
    clockIn: new Date(),
    paused: false,
    accumulatedSeconds: 0,
  };
  const list = taskActivities[taskId] ?? (taskActivities[taskId] = []);
  list.unshift({
    id: Date.now(),
    taskId,
    userId: actor.id,
    action: "time_logged",
    oldValue: null,
    newValue: "started timer",
    metadata: null,
    createdAt: new Date(),
    user: actor,
  });
  mockNotifyTaskMembers({
    taskId,
    actor,
    type: "task_updated",
    title: "Timer started",
    message: `${label} started the timer on "${taskTitle}"`,
  });
  return { taskId, startedAt: activeTaskTimers[userId].clockIn };
}

export function mockPauseTaskTimer(userId: number, taskId: number, actor: SafeUser) {
  const active = activeTaskTimers[userId];
  if (!active || active.taskId !== taskId || active.paused || !active.clockIn) {
    throw new Error("No running timer for this task");
  }

  active.accumulatedSeconds += Math.floor((Date.now() - active.clockIn.getTime()) / 1000);
  active.clockIn = null;

  const secondsToSave = active.accumulatedSeconds;
  if (secondsToSave >= 1) {
    persistTaskTimeEntry(taskId, userId, actor, secondsToSave, "Task timer (paused)");
    active.accumulatedSeconds = 0;
  }

  active.paused = true;

  const activities = taskActivities[taskId] ?? (taskActivities[taskId] = []);
  activities.unshift({
    id: Date.now(),
    taskId,
    userId: actor.id,
    action: "time_logged",
    oldValue: null,
    newValue: "paused timer",
    metadata: null,
    createdAt: new Date(),
    user: actor,
  });

  const task = tasks.find((t) => t.id === taskId);
  mockNotifyTaskMembers({
    taskId,
    actor,
    type: "task_updated",
    title: "Timer paused",
    message: `${mockActorLabel(actor)} paused the timer on "${task?.title ?? "a task"}"`,
  });

  return { accumulatedSeconds: active.accumulatedSeconds, savedSeconds: secondsToSave };
}

export function mockStopTaskTimer(userId: number, taskId: number, actor: SafeUser) {
  const active = activeTaskTimers[userId];
  if (!active || active.taskId !== taskId) {
    throw new Error("No active timer for this task");
  }

  let totalSeconds = active.accumulatedSeconds;
  if (active.clockIn) {
    totalSeconds += Math.floor((Date.now() - active.clockIn.getTime()) / 1000);
  }
  delete activeTaskTimers[userId];

  const durationMinutes = totalSeconds >= 1
    ? persistTaskTimeEntry(taskId, userId, actor, totalSeconds)
    : 0;

  const task = tasks.find((t) => t.id === taskId);
  mockNotifyTaskMembers({
    taskId,
    actor,
    type: "task_updated",
    title: "Timer stopped",
    message: `${mockActorLabel(actor)} stopped the timer on "${task?.title ?? "a task"}" (${durationMinutes} min)`,
  });

  return { durationMinutes };
}

export function mockAddTaskComment(taskId: number, message: string, actor: SafeUser) {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new Error("Task not found");

  const list = taskActivities[taskId] ?? (taskActivities[taskId] = []);
  const activity = {
    id: Date.now(),
    taskId,
    userId: actor.id,
    action: "commented" as const,
    oldValue: null,
    newValue: message,
    metadata: null,
    createdAt: new Date(),
    user: actor,
  };
  list.unshift(activity);
  task.updatedAt = new Date();

  const preview = message.length > 120 ? `${message.slice(0, 120)}…` : message;
  mockNotifyTaskMembers({
    taskId,
    actor,
    type: "mention",
    title: "New comment on task",
    message: `${mockActorLabel(actor)}: ${preview}`,
  });

  return activity;
}

export function mockCreateSubtask(taskId: number, title: string, actor: SafeUser) {
  const list = taskSubtasks[taskId] ?? (taskSubtasks[taskId] = []);
  const id = list.reduce((max, s) => Math.max(max, s.id), 0) + 1;
  const subtask = {
    id,
    taskId,
    title,
    completed: false,
    position: list.length,
    createdAt: new Date(),
  };
  list.push(subtask);

  const activities = taskActivities[taskId] ?? (taskActivities[taskId] = []);
  activities.unshift({
    id: Date.now(),
    taskId,
    userId: actor.id,
    action: "commented",
    oldValue: null,
    newValue: `added subtask: ${title}`,
    metadata: { subtaskId: id },
    createdAt: new Date(),
    user: actor,
  });

  const task = tasks.find((t) => t.id === taskId);
  if (task) task.updatedAt = new Date();

  return subtask;
}

export function mockCreateTask(
  input: {
    title: string;
    description?: string;
    priority?: string;
    assigneeId?: number;
    projectId?: number | null;
    dueDate?: string;
    estimatedHours?: number | string;
    tags?: string[];
    stage?: string;
  },
  actor: SafeUser,
) {
  const id = tasks.reduce((max, t) => Math.max(max, t.id), 0) + 1;
  const assignee = input.assigneeId ? userById(input.assigneeId) : undefined;

  const newTask = {
    id,
    title: input.title,
    description: input.description ?? null,
    status: "todo" as const,
    stage: (input.stage ?? "new") as typeof tasks[number]["stage"],
    priority: (input.priority ?? "medium") as "low" | "medium" | "high" | "urgent",
    assigneeId: input.assigneeId,
    projectId: input.projectId ?? undefined,
    createdBy: actor.id,
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
    estimatedHours: input.estimatedHours != null ? String(input.estimatedHours) : null,
    actualHours: "0.00",
    position: tasks.length,
    createdAt: new Date(),
    updatedAt: new Date(),
    assignee: assignee ?? (input.assigneeId === actor.id ? actor : undefined),
  };

  tasks.unshift(newTask);
  taskParticipants[id] = [];
  taskObservers[id] = [];
  taskActivities[id] = [
    {
      id: Date.now(),
      taskId: id,
      userId: actor.id,
      action: "created",
      oldValue: null,
      newValue: input.title,
      metadata: input.tags?.length ? { tags: input.tags } : null,
      createdAt: new Date(),
      user: actor,
    },
  ];

  if (input.assigneeId && input.assigneeId !== actor.id) {
    mockNotifyTaskMembers({
      taskId: id,
      actor,
      type: "task_assigned",
      title: "New task assigned",
      message: `${mockActorLabel(actor)} created "${input.title}" and assigned it to you`,
    });
  }

  return newTask;
}

export function mockDeleteTask(id: number, actor: SafeUser) {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) throw new Error("Task not found");

  const task = tasks[index];
  if (task.createdBy !== actor.id && actor.role === "employee") {
    throw new Error("Not authorized to delete this task");
  }

  tasks.splice(index, 1);
  delete taskParticipants[id];
  delete taskObservers[id];
  delete taskActivities[id];
  delete taskTimeEntries[id];

  for (const userId of Object.keys(activeTaskTimers)) {
    if (activeTaskTimers[Number(userId)]?.taskId === id) {
      delete activeTaskTimers[Number(userId)];
    }
  }

  return { success: true };
}

export function mockUpdateTask(
  id: number,
  data: {
    assigneeId?: number | null;
    createdBy?: number | null;
    status?: string;
    stage?: string;
    description?: string;
    dueDate?: string | null;
    projectId?: number | null;
  },
  actor: SafeUser,
) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return null;

  const label = mockActorLabel(actor);
  const taskTitle = task.title;

  if (data.description !== undefined) task.description = data.description;
  if (data.createdBy !== undefined && data.createdBy !== null) {
    task.createdBy = data.createdBy;
  }
  if (data.dueDate !== undefined) {
    task.dueDate = data.dueDate;
    if (data.dueDate && task.status === "done") {
      task.status = "todo";
    }
  }
  if (data.status) {
    const list = taskActivities[id] ?? (taskActivities[id] = []);
    list.unshift({
      id: Date.now(),
      taskId: id,
      userId: actor.id,
      action: "status_changed",
      oldValue: task.status,
      newValue: data.status,
      metadata: null,
      createdAt: new Date(),
      user: actor,
    });
    task.status = data.status as typeof task.status;
    mockNotifyTaskMembers({
      taskId: id,
      actor,
      type: "task_updated",
      title: "Task status changed",
      message: `${label} changed "${taskTitle}" to ${data.status.replace(/_/g, " ")}`,
    });
  }
  if (data.stage) {
    const oldStage = task.stage ?? legacyStatusToStage(task.status);
    task.stage = data.stage as typeof task.stage;
    if (data.stage === "finished") {
      task.status = "done";
    } else if (task.status === "done") {
      task.status = "in_progress";
    }
    const list = taskActivities[id] ?? (taskActivities[id] = []);
    list.unshift({
      id: Date.now() + 2,
      taskId: id,
      userId: actor.id,
      action: "stage_changed",
      oldValue: oldStage,
      newValue: data.stage,
      metadata: null,
      createdAt: new Date(),
      user: actor,
    });
    mockNotifyTaskMembers({
      taskId: id,
      actor,
      type: "task_updated",
      title: "Task stage changed",
      message: `${label} moved "${taskTitle}" to ${data.stage}`,
    });
  }
  if (data.assigneeId !== undefined) {
    const oldAssigneeId = task.assigneeId ?? null;
    const newAssigneeId = data.assigneeId ?? null;

    const newAssignee = newAssigneeId ? userById(newAssigneeId) : null;
    task.assigneeId = newAssigneeId ?? undefined;
    task.assignee = newAssignee;

    if (newAssigneeId) {
      mockRemoveObserver(id, newAssigneeId);
    }
    if (oldAssigneeId && oldAssigneeId !== newAssigneeId) {
      mockAddObserver(id, oldAssigneeId, actor, true);
    }

    const list = taskActivities[id] ?? (taskActivities[id] = []);
    list.unshift({
      id: Date.now() + 1,
      taskId: id,
      userId: actor.id,
      action: "assigned",
      oldValue: userById(oldAssigneeId ?? 0)?.name ?? "Unassigned",
      newValue: newAssignee?.name ?? "Unassigned",
      metadata: null,
      createdAt: new Date(),
      user: actor,
    });

    if (newAssigneeId) {
      mockNotifyTaskMembers({
        taskId: id,
        actor,
        type: "task_assigned",
        title: "Task reassigned",
        message: `${label} assigned "${taskTitle}" to ${newAssignee?.name ?? newAssignee?.email ?? "someone"}`,
      });
    } else {
      mockNotifyTaskMembers({
        taskId: id,
        actor,
        type: "task_updated",
        title: "Task updated",
        message: `${label} removed the assignee from "${taskTitle}"`,
      });
    }
  }
  if (data.projectId !== undefined) {
    task.projectId = data.projectId ?? undefined;
  }
  task.updatedAt = new Date();
  return task;
}

export function mockUpdateStatus(id: number, status: string, actor: SafeUser) {
  return mockUpdateTask(id, { status }, actor);
}

export function mockAddParticipant(taskId: number, userId: number, actor: SafeUser) {
  const user = userById(userId);
  if (!user) return { success: false };
  const list = taskParticipants[taskId] ?? (taskParticipants[taskId] = []);
  if (!list.find((p) => p.id === userId)) {
    list.push(user);
    const activities = taskActivities[taskId] ?? (taskActivities[taskId] = []);
    activities.unshift({
      id: Date.now(),
      taskId,
      userId: actor.id,
      action: "participant_added",
      oldValue: null,
      newValue: user.name,
      metadata: null,
      createdAt: new Date(),
      user: actor,
    });

    const task = tasks.find((t) => t.id === taskId);
    mockNotifyTaskMembers({
      taskId,
      actor,
      type: "task_updated",
      title: "Added as participant",
      message: `${mockActorLabel(actor)} added ${user.name ?? user.email ?? "someone"} as a participant on "${task?.title ?? "a task"}"`,
      extraRecipientIds: [userId],
    });
  }
  return { success: true };
}

export function mockRemoveParticipant(taskId: number, userId: number) {
  const list = taskParticipants[taskId];
  if (!list) return { success: true };
  taskParticipants[taskId] = list.filter((p) => p.id !== userId);
  return { success: true };
}

export function mockAddObserver(
  taskId: number,
  userId: number,
  actor?: SafeUser,
  logActivity = true,
) {
  const task = tasks.find((t) => t.id === taskId);
  const user = userById(userId);
  if (!task || !user) return { success: false };
  if (task.assigneeId === userId) return { success: false };

  const list = taskObservers[taskId] ?? (taskObservers[taskId] = []);
  if (list.find((p) => p.id === userId)) return { success: true };

  list.push(user);

  if (logActivity && actor) {
    const activities = taskActivities[taskId] ?? (taskActivities[taskId] = []);
    activities.unshift({
      id: Date.now(),
      taskId,
      userId: actor.id,
      action: "observer_added",
      oldValue: null,
      newValue: user.name,
      metadata: null,
      createdAt: new Date(),
      user: actor,
    });

    mockNotifyTaskMembers({
      taskId,
      actor,
      type: "task_updated",
      title: "Added as observer",
      message: `${mockActorLabel(actor)} added ${user.name ?? user.email ?? "someone"} as an observer on "${task.title}"`,
      extraRecipientIds: [userId],
    });
  }
  return { success: true };
}

export function mockRemoveObserver(taskId: number, userId: number) {
  const list = taskObservers[taskId];
  if (!list) return { success: true };
  taskObservers[taskId] = list.filter((p) => p.id !== userId);
  return { success: true };
}

export function mockProjectList(currentUserId = DEV_USER.id) {
  return projects.map((p) => {
    const projectTasks = tasks.filter((t) => t.projectId === p.id);
    const memberMap = new Map<number, SafeUser>();
    for (const t of projectTasks) {
      if (t.assigneeId) {
        memberMap.set(t.assigneeId, t.assignee ?? userById(t.assigneeId) ?? DEV_USER);
      }
      if (t.createdBy) {
        const creator = userById(t.createdBy);
        if (creator) memberMap.set(t.createdBy, creator);
      }
      for (const participant of taskParticipants[t.id] ?? []) {
        memberMap.set(participant.id, participant);
      }
    }
    if (p.createdBy) {
      const creator = userById(p.createdBy);
      if (creator) memberMap.set(p.createdBy, creator);
    }

    const lastTaskUpdate = projectTasks.reduce<Date | null>((max, t) => {
      const d = new Date(t.updatedAt);
      if (Number.isNaN(d.getTime())) return max;
      return !max || d > max ? d : max;
    }, null);

    const lastActiveAt = lastTaskUpdate ?? new Date(p.updatedAt);
    const taskCount = projectTasks.length;
    const completedCount = projectTasks.filter((t) => t.status === "done").length;
    const creator = userById(p.createdBy);

    return {
      ...p,
      taskCount,
      completedCount,
      creator: creator
        ? {
            id: creator.id,
            name: creator.name,
            avatar: creator.avatar,
            department: creator.department,
            position: creator.position,
          }
        : null,
      performance: projectPerformancePercent(taskCount, completedCount),
      lastActiveAt: lastActiveAt.toISOString(),
      members: [...memberMap.values()].slice(0, 6).map((u) => ({
        id: u.id,
        name: u.name,
        avatar: u.avatar,
      })),
      privacyType: "Public" as const,
    };
  });
}

export function mockProjectById(id: number, currentUserId = DEV_USER.id) {
  const project = projects.find((p) => p.id === id);
  if (!project) return null;

  const user = userById(currentUserId) ?? DEV_USER;
  const joined = mockIsProjectMember(id, currentUserId, project.createdBy);
  const canViewTasks = mockCanViewProjectTasks(user, project.createdBy, joined);

  const projectTasks = canViewTasks ? tasks.filter((t) => t.projectId === id) : [];
  const memberIds = new Set<number>();
  if (project.createdBy) memberIds.add(project.createdBy);
  for (const key of projectMemberKeys) {
    const [pid, uid] = key.split(":").map(Number);
    if (pid === id) memberIds.add(uid);
  }
  for (const t of projectTasks) {
    if (t.assigneeId) memberIds.add(t.assigneeId);
    if (t.createdBy) memberIds.add(t.createdBy);
    for (const p of taskParticipants[t.id] ?? []) memberIds.add(p.id);
    for (const o of taskObservers[t.id] ?? []) memberIds.add(o.id);
  }

  const dueDates = projectTasks
    .map((t) => t.dueDate)
    .filter((d): d is string => Boolean(d))
    .sort();

  const hoursTracked = projectTasks.reduce(
    (sum, t) => sum + parseFloat(String(t.actualHours ?? "0")),
    0,
  );

  return {
    ...project,
    creator: userById(project.createdBy),
    stats: {
      total: projectTasks.length,
      todo: projectTasks.filter((t) => t.status === "todo").length,
      inProgress: projectTasks.filter((t) => t.status === "in_progress").length,
      review: projectTasks.filter((t) => t.status === "review").length,
      done: projectTasks.filter((t) => t.status === "done").length,
    },
    hoursTracked: Math.round(hoursTracked * 10) / 10,
    memberCount: memberIds.size || 1,
    dueDate: dueDates[0] ?? null,
    isMember: joined,
    canViewTasks,
  };
}

export function mockJoinProject(projectId: number, userId: number) {
  const project = projects.find((p) => p.id === projectId);
  if (!project) throw new Error("Project not found");

  projectMemberKeys.add(mockMemberKey(projectId, userId));
  const user = userById(userId) ?? DEV_USER;
  const joined = mockIsProjectMember(projectId, userId, project.createdBy);

  return {
    success: true,
    isMember: joined,
    canViewTasks: mockCanViewProjectTasks(user, project.createdBy, joined),
  };
}

export function mockBulkTaskAction(
  input: {
    taskIds: number[];
    action: "delete" | "status" | "move_project";
    status?: "todo" | "in_progress" | "review" | "done";
    projectId?: number | null;
  },
  _user: SafeUser,
) {
  const ids = new Set(input.taskIds);
  if (input.action === "delete") {
    for (let i = tasks.length - 1; i >= 0; i--) {
      if (ids.has(tasks[i].id)) tasks.splice(i, 1);
    }
    return { success: true, affected: input.taskIds.length };
  }

  for (const task of tasks) {
    if (!ids.has(task.id)) continue;
    if (input.action === "status" && input.status) {
      task.status = input.status;
    }
    if (input.action === "move_project") {
      task.projectId = input.projectId ?? null;
    }
    task.updatedAt = new Date();
  }

  return { success: true, affected: input.taskIds.length };
}

export function mockDeleteProject(id: number) {
  const projectIndex = projects.findIndex((p) => p.id === id);
  if (projectIndex === -1) return { success: false };

  projects.splice(projectIndex, 1);

  for (const key of [...projectMemberKeys]) {
    if (key.startsWith(`${id}:`)) projectMemberKeys.delete(key);
  }

  for (let i = tasks.length - 1; i >= 0; i--) {
    if (tasks[i].projectId === id) {
      const taskId = tasks[i].id;
      delete taskParticipants[taskId];
      delete taskObservers[taskId];
      tasks.splice(i, 1);
    }
  }

  return { success: true };
}

export function mockNotificationList(userId: number, unreadOnly = false) {
  const notifs = notifications.filter((n) => n.userId === userId);
  const filtered = unreadOnly ? notifs.filter((n) => !n.read) : notifs;
  return {
    notifications: filtered,
    unreadCount: notifs.filter((n) => !n.read).length,
  };
}

export function mockLatestNotificationId(userId: number) {
  const userNotifs = notifications.filter((n) => n.userId === userId);
  if (userNotifs.length === 0) return 0;
  return Math.max(...userNotifs.map((n) => n.id));
}

export function mockNotificationsSince(userId: number, sinceId: number) {
  return notifications
    .filter((n) => n.userId === userId && n.id > sinceId)
    .sort((a, b) => a.id - b.id);
}

export function mockMarkAllNotificationsRead(userId: number) {
  for (const n of notifications) {
    if (n.userId === userId) n.read = true;
  }
  return { success: true };
}

export function mockMarkNotificationRead(userId: number, id: number) {
  const notif = notifications.find((n) => n.id === id && n.userId === userId);
  if (notif) notif.read = true;
  return notif ?? null;
}

export function mockDeleteNotification(userId: number, id: number) {
  const index = notifications.findIndex((n) => n.id === id && n.userId === userId);
  if (index >= 0) notifications.splice(index, 1);
  return { success: true };
}

export function mockUserList() {
  return { users: users.map((u) => ({ ...u })), total: users.length };
}

export type ProfileUpdateInput = {
  name?: string;
  email?: string;
  department?: string | null;
  position?: string | null;
  phone?: string | null;
  avatar?: string | null;
};

export function mockUpdateUserProfile(userId: number, data: ProfileUpdateInput) {
  const user = userById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  if (data.name !== undefined) user.name = data.name;
  if (data.email !== undefined) user.email = data.email;
  if (data.department !== undefined) user.department = data.department;
  if (data.position !== undefined) user.position = data.position;
  if (data.phone !== undefined) user.phone = data.phone;
  if (data.avatar !== undefined) user.avatar = data.avatar;
  user.updatedAt = new Date();

  return { ...user };
}

export type PersonalInfoUpdateInput = {
  firstName?: string | null;
  lastName?: string | null;
  secondName?: string | null;
  email?: string;
  department?: string | null;
  position?: string | null;
  phone?: string | null;
  city?: string | null;
  dateOfBirth?: string | null;
  sex?: "male" | "female" | "other" | "prefer_not_to_say" | null;
  notificationLanguage?: string | null;
  headOfDepartmentUserIds?: number[];
};

function mockPersonalRecord(user: SafeUser) {
  const parts = (user.name ?? "").trim().split(/\s+/);
  const firstName = user.firstName ?? parts[0] ?? null;
  const lastName = user.lastName ?? (parts.length > 1 ? parts.slice(1).join(" ") : null);
  const headIds = user.headOfDepartmentUserIds ?? [];
  return {
    firstName,
    lastName,
    secondName: user.secondName ?? null,
    email: user.email ?? null,
    position: user.position ?? null,
    department: user.department ?? null,
    phone: user.phone ?? null,
    city: user.city ?? null,
    dateOfBirth: user.dateOfBirth ?? null,
    sex: user.sex ?? null,
    notificationLanguage: user.notificationLanguage ?? "en",
    headOfDepartmentUserIds: headIds,
    headsOfDepartment: headIds
      .map((id) => userById(id))
      .filter((u): u is SafeUser => Boolean(u))
      .map((u) => ({ id: u.id, name: u.name })),
  };
}

export function mockGetPersonalInfo(userId: number) {
  const user = userById(userId);
  if (!user) throw new Error("User not found");
  return mockPersonalRecord(user);
}

export function mockUpdatePersonalInfo(userId: number, data: PersonalInfoUpdateInput) {
  const user = userById(userId);
  if (!user) throw new Error("User not found");

  if (data.firstName !== undefined) user.firstName = data.firstName;
  if (data.lastName !== undefined) user.lastName = data.lastName;
  if (data.secondName !== undefined) user.secondName = data.secondName;
  if (data.email !== undefined) user.email = data.email;
  if (data.department !== undefined) user.department = data.department;
  if (data.position !== undefined) user.position = data.position;
  if (data.phone !== undefined) user.phone = data.phone;
  if (data.city !== undefined) user.city = data.city;
  if (data.sex !== undefined) user.sex = data.sex;
  if (data.notificationLanguage !== undefined) {
    user.notificationLanguage = data.notificationLanguage;
  }
  if (data.headOfDepartmentUserIds !== undefined) {
    user.headOfDepartmentUserIds = data.headOfDepartmentUserIds;
  }
  if (data.dateOfBirth !== undefined) {
    user.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
  }
  if (data.firstName !== undefined || data.lastName !== undefined) {
    const combined = [user.firstName, user.lastName].filter(Boolean).join(" ");
    if (combined) user.name = combined;
  }
  user.updatedAt = new Date();

  return mockPersonalRecord(user);
}

export function mockCurrentSession(userId: number) {
  const session = workSessionsByUser[userId];
  if (!session?.active) return null;
  const view = mockWorkSessionView(session);
  const existing = timeApprovalRequests.find(
    (r) => r.workSessionId === session.id && r.type === "clock_in",
  );
  return {
    ...view,
    clockInRequest: existing
      ? {
          id: existing.id,
          requestedClockIn: existing.requestedClockIn!,
          reason: existing.reason,
          status: existing.status,
        }
      : null,
    pendingClockInRequest:
      existing?.status === "pending"
        ? {
            id: existing.id,
            requestedClockIn: existing.requestedClockIn!,
            reason: existing.reason,
          }
        : null,
  };
}

export function mockClockIn(userId: number, note?: string) {
  const now = new Date();
  const existing = workSessionsByUser[userId];
  if (existing?.active) {
    mockClockOut(userId);
  }

  const sessionId = nextWorkEntryId++;
  workSessionsByUser[userId] = {
    id: sessionId,
    userId,
    startTime: now,
    endTime: null,
    active: true,
    paused: false,
    accumulatedWorkSeconds: 0,
    workSegmentStartedAt: now,
    breakStartedAt: null,
  };

  const entry: MockWorkEntry = {
    id: nextWorkEntryId++,
    userId,
    taskId: null,
    projectId: null,
    clockIn: now,
    clockOut: null,
    duration: null,
    durationSeconds: null,
    note: note || "Clocked in",
    source: "web",
    createdAt: now,
    updatedAt: now,
  };
  userWorkEntries.unshift(entry);

  return { entry, session: mockWorkSessionView(workSessionsByUser[userId]) };
}

export function mockClockOut(userId: number, note?: string) {
  const now = new Date();
  const session = workSessionsByUser[userId];
  const openEntry = userWorkEntries.find(
    (e) => e.userId === userId && !e.clockOut && e.taskId == null,
  );

  let durationSeconds = 0;
  if (session?.active) {
    if (session.paused) {
      const openBreak = (workBreaksByUser[userId] ?? []).find(
        (b) => b.workSessionId === session.id && !b.endTime,
      );
      if (openBreak) {
        openBreak.endTime = now;
        openBreak.updatedAt = now;
      }
    }
    const { workElapsedSeconds } = workSessionTiming(session);
    durationSeconds = Math.max(0, workElapsedSeconds);
    session.active = false;
    session.endTime = now;
    session.paused = false;
    session.workSegmentStartedAt = null;
    session.breakStartedAt = null;
  }

  if (openEntry) {
    if (!durationSeconds) {
      durationSeconds = Math.max(
        0,
        Math.floor((now.getTime() - openEntry.clockIn.getTime()) / 1000),
      );
    }
    openEntry.clockOut = now;
    openEntry.durationSeconds = durationSeconds;
    openEntry.duration = Math.floor(durationSeconds / 60);
    openEntry.updatedAt = now;
    if (note) openEntry.note = `${openEntry.note || ""} - ${note}`.trim();
  }

  return {
    durationSeconds,
    duration: Math.floor(durationSeconds / 60),
    entry: openEntry ? { ...openEntry } : null,
  };
}

export function mockPauseWorkSession(userId: number) {
  const session = workSessionsByUser[userId];
  if (!session?.active || session.paused || !session.workSegmentStartedAt) {
    throw new Error("No active work session to pause");
  }

  session.accumulatedWorkSeconds += Math.floor(
    (Date.now() - session.workSegmentStartedAt.getTime()) / 1000,
  );
  const breakStart = new Date();
  session.workSegmentStartedAt = null;
  session.breakStartedAt = breakStart;
  session.paused = true;

  const openEntry = userWorkEntries.find(
    (e) => e.userId === userId && !e.clockOut && e.taskId == null,
  );
  const list = workBreaksByUser[userId] ?? (workBreaksByUser[userId] = []);
  list.push({
    id: nextWorkBreakId++,
    userId,
    workSessionId: session.id,
    timeEntryId: openEntry?.id ?? null,
    startTime: breakStart,
    endTime: null,
    reason: null,
    manuallyEdited: false,
    createdAt: breakStart,
    updatedAt: breakStart,
  });

  return mockWorkSessionView(session);
}

export function mockResumeWorkSession(userId: number) {
  const session = workSessionsByUser[userId];
  if (!session?.active || !session.paused) {
    throw new Error("Work session is not paused");
  }

  const resumeTime = new Date();
  session.workSegmentStartedAt = resumeTime;
  session.breakStartedAt = null;
  session.paused = false;

  const openBreak = (workBreaksByUser[userId] ?? []).find(
    (b) => b.workSessionId === session.id && !b.endTime,
  );
  if (openBreak) {
    openBreak.endTime = resumeTime;
    openBreak.updatedAt = resumeTime;
  }

  return mockWorkSessionView(session);
}

export function mockTimeEntryList(userId: number, opts?: { limit?: number }) {
  const limit = opts?.limit ?? 50;
  const completed = allUserTimeEntries(userId);
  const openEntry = userWorkEntries.find(
    (e) => e.userId === userId && !e.clockOut && e.taskId == null,
  );
  const entries = openEntry
    ? [openEntry, ...completed.filter((e) => e.id !== openEntry.id)]
    : completed;

  return {
    entries: entries.slice(0, limit),
    total: entries.length,
  };
}

export function mockTimeStats(userId: number, period: "today" | "week" | "month" = "week") {
  const now = new Date();
  const { start, end } = periodClockInBounds(period, now);
  const entries = allUserTimeEntries(userId).filter(
    (e) =>
      e.taskId == null &&
      e.clockOut &&
      e.clockIn >= start &&
      e.clockIn <= end,
  );

  const dailyMapSeconds = new Map<string, number>();
  for (const e of entries) {
    const date = localDateKey(e.clockIn);
    dailyMapSeconds.set(date, (dailyMapSeconds.get(date) ?? 0) + attendanceEntrySeconds(e));
  }

  const session = workSessionsByUser[userId];
  let activeSession: { date: string; workSeconds: number } | null = null;

  if (session?.active && session.startTime >= start && session.startTime <= end) {
    const sessionDate = localDateKey(session.startTime);
    const workSeconds = computeSessionWorkSeconds({
      ...session,
      startTime: session.startTime,
    }, now);
    dailyMapSeconds.set(
      sessionDate,
      (dailyMapSeconds.get(sessionDate) ?? 0) + workSeconds,
    );
    activeSession = { date: sessionDate, workSeconds };
  }

  const totalSeconds = Array.from(dailyMapSeconds.values()).reduce((sum, s) => sum + s, 0);
  const dailyMapMinutes = new Map(
    Array.from(dailyMapSeconds.entries()).map(([date, seconds]) => [date, seconds / 60]),
  );
  const summary = buildTimeStatsSummary(totalSeconds / 60, dailyMapMinutes, period);

  return {
    ...summary,
    totalSeconds,
    entriesCount: entries.length,
    activeSession,
  };
}

function mockDayEntriesForUser(userId: number, dateStr: string, now = new Date()) {
  const { start, end } = dayBounds(dateStr);
  const completed = userWorkEntries.filter(
    (e) =>
      e.userId === userId &&
      e.taskId == null &&
      e.clockIn >= start &&
      e.clockIn <= end,
  );

  const openAttendance = userWorkEntries.find(
    (e) =>
      e.userId === userId &&
      !e.clockOut &&
      e.taskId == null &&
      e.clockIn >= start &&
      e.clockIn <= end,
  );

  const entries = [...completed];
  if (openAttendance && !entries.some((e) => e.id === openAttendance.id)) {
    entries.push(openAttendance);
  }

  entries.sort((a, b) => a.clockIn.getTime() - b.clockIn.getTime());

  let attendanceLiveSeconds = 0;
  const session = workSessionsByUser[userId];
  if (session?.active && localDateKey(session.startTime) === dateStr) {
    attendanceLiveSeconds = computeSessionWorkSeconds(
      { ...session, startTime: session.startTime },
      now,
    );
  } else if (openAttendance) {
    attendanceLiveSeconds = Math.max(
      0,
      Math.floor((now.getTime() - openAttendance.clockIn.getTime()) / 1000),
    );
  }

  const totalSeconds = sumAttendanceDaySeconds(entries, attendanceLiveSeconds);

  const enrichedEntries = entries.map((entry) => {
    const durationSeconds = displayAttendanceDurationSeconds(entry, attendanceLiveSeconds);
    return {
      id: entry.id,
      clockIn: entry.clockIn,
      clockOut: entry.clockOut,
      durationSeconds,
      duration: durationSeconds != null ? Math.floor(durationSeconds / 60) : null,
      note: entry.note,
    };
  });

  return {
    entries: enrichedEntries,
    totalMinutes: totalSeconds / 60,
    totalSeconds,
    totalHours: roundHours(totalSeconds / 3600),
    entriesCount: entries.length,
  };
}

function sumAttendanceDaySeconds(
  entries: Array<MockWorkEntry>,
  attendanceLiveSeconds: number,
) {
  let totalSeconds = 0;
  let countedAttendanceLive = false;

  for (const entry of entries) {
    if (entry.clockOut) {
      totalSeconds += attendanceEntrySeconds(entry);
      continue;
    }

    if (!entry.clockOut && attendanceLiveSeconds > 0) {
      totalSeconds += attendanceLiveSeconds;
      countedAttendanceLive = true;
    }
  }

  if (attendanceLiveSeconds > 0 && !countedAttendanceLive) {
    totalSeconds += attendanceLiveSeconds;
  }

  return totalSeconds;
}

function displayAttendanceDurationSeconds(
  entry: MockWorkEntry,
  attendanceLiveSeconds: number,
) {
  if (entry.clockOut) return attendanceEntrySeconds(entry);
  if (!entry.clockOut && attendanceLiveSeconds > 0) {
    return attendanceLiveSeconds;
  }
  return null;
}

export function mockGetBreaks(userId: number, dateStr: string) {
  const { start, end } = dayBounds(dateStr);
  const breaks = (workBreaksByUser[userId] ?? []).filter(
    (b) => b.startTime >= start && b.startTime <= end,
  );
  const pendingByBreakId = new Map(
    timeApprovalRequests
      .filter((r) => r.userId === userId && r.type === "break" && r.status === "pending" && r.workBreakId)
      .map((r) => [r.workBreakId!, r]),
  );

  return {
    breaks: breaks
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      .map((b) => {
        const pending = pendingByBreakId.get(b.id);
        return {
          ...b,
          pendingEdit: pending
            ? {
                id: pending.id,
                requestedBreakStart: pending.requestedBreakStart!,
                requestedBreakEnd: pending.requestedBreakEnd,
                reason: pending.reason,
              }
            : null,
        };
      }),
  };
}

export function mockRequestBreakEdit(
  actor: SafeUser,
  input: { id: number; startTime: string; endTime?: string | null; reason: string },
) {
  const list = workBreaksByUser[actor.id] ?? [];
  const existing = list.find((b) => b.id === input.id);
  if (!existing) throw new Error("Break not found");

  const startTime = new Date(input.startTime);
  const endTime = input.endTime ? new Date(input.endTime) : null;
  if (endTime && endTime <= startTime) {
    throw new Error("Break end must be after break start");
  }

  if (actor.role === "admin") {
    existing.startTime = startTime;
    existing.endTime = endTime;
    existing.reason = input.reason.trim();
    existing.manuallyEdited = true;
    existing.updatedAt = new Date();
    return { ...existing, requiresApproval: false };
  }

  const existingPending = timeApprovalRequests.find(
    (r) => r.workBreakId === input.id && r.type === "break" && r.status === "pending",
  );
  if (existingPending) throw new Error("A break edit request is already pending approval");

  const now = new Date();
  const request: MockTimeApprovalRequest = {
    id: nextApprovalId++,
    userId: actor.id,
    type: "break",
    status: "pending",
    reason: input.reason.trim(),
    workSessionId: existing.workSessionId,
    timeEntryId: existing.timeEntryId,
    workBreakId: existing.id,
    originalClockIn: null,
    originalBreakStart: existing.startTime,
    originalBreakEnd: existing.endTime,
    requestedClockIn: null,
    requestedBreakStart: startTime,
    requestedBreakEnd: endTime,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: now,
    updatedAt: now,
  };
  timeApprovalRequests.unshift(request);

  const actorName = actor.name || actor.email || "An employee";
  mockNotifyAdmins(
    actor,
    "Break edit needs approval",
    `${actorName} requested a break time change: ${input.reason.trim()}`,
    request.id,
  );

  return { ...request, requiresApproval: true };
}

export function mockRequestManualClockIn(
  actor: SafeUser,
  input: { requestedClockIn: string; reason: string },
) {
  const session = workSessionsByUser[actor.id];
  if (!session?.active) throw new Error("You must be clocked in to request a manual clock-in time");

  const openEntry = userWorkEntries.find(
    (e) => e.userId === actor.id && !e.clockOut && e.taskId == null,
  );
  const actualClockIn = openEntry?.clockIn ?? session.startTime;
  const requestedClockIn = new Date(input.requestedClockIn);

  if (requestedClockIn >= actualClockIn) {
    throw new Error("Manual clock-in time must be earlier than your actual clock-in time");
  }
  if (localDateKey(requestedClockIn) !== localDateKey(actualClockIn)) {
    throw new Error("Manual clock-in must be on the same day as your session");
  }

  const existingRequest = timeApprovalRequests.find(
    (r) => r.workSessionId === session.id && r.type === "clock_in",
  );
  if (existingRequest) {
    throw new Error("You have already submitted a manual clock-in request for this session");
  }

  const now = new Date();
  const request: MockTimeApprovalRequest = {
    id: nextApprovalId++,
    userId: actor.id,
    type: "clock_in",
    status: "pending",
    reason: input.reason.trim(),
    workSessionId: session.id,
    timeEntryId: openEntry?.id ?? null,
    workBreakId: null,
    originalClockIn: actualClockIn,
    originalBreakStart: null,
    originalBreakEnd: null,
    requestedClockIn,
    requestedBreakStart: null,
    requestedBreakEnd: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: now,
    updatedAt: now,
  };
  timeApprovalRequests.unshift(request);

  const actorName = actor.name || actor.email || "An employee";
  const requestedLabel = requestedClockIn.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const actualLabel = actualClockIn.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  mockNotifyAdmins(
    actor,
    "Manual clock-in needs approval",
    `${actorName} requests clock-in at ${requestedLabel} instead of ${actualLabel}: ${input.reason.trim()}`,
    request.id,
  );

  return { ...request, requiresApproval: true };
}

export function mockListPendingApprovals() {
  return {
    requests: timeApprovalRequests
      .filter((r) => r.status === "pending")
      .map((r) => ({
        ...r,
        user: userById(r.userId),
      })),
  };
}

export function mockReviewTimeApproval(
  actor: SafeUser,
  input: { id: number; action: "approve" | "reject"; reviewNote?: string },
) {
  const request = timeApprovalRequests.find((r) => r.id === input.id);
  if (!request) throw new Error("Approval request not found");
  if (request.status !== "pending") throw new Error("This request has already been reviewed");

  const approved = input.action === "approve";
  if (approved) {
    if (request.type === "clock_in") {
      const session = request.workSessionId
        ? workSessionsByUser[request.userId]
        : undefined;
      if (!session) throw new Error("Work session not found");
      const entry = request.timeEntryId
        ? userWorkEntries.find((e) => e.id === request.timeEntryId)
        : undefined;
      mockApplyClockInApproval(request, session, entry);
    } else if (request.type === "break") {
      const list = workBreaksByUser[request.userId] ?? [];
      const breakItem = list.find((b) => b.id === request.workBreakId);
      if (!breakItem || !request.requestedBreakStart) throw new Error("Break not found");
      breakItem.startTime = request.requestedBreakStart;
      breakItem.endTime = request.requestedBreakEnd;
      breakItem.reason = request.reason;
      breakItem.manuallyEdited = true;
      breakItem.updatedAt = new Date();

      const session = workSessionsByUser[request.userId];
      if (session?.active && session.paused && session.breakStartedAt && !breakItem.endTime) {
        session.breakStartedAt = request.requestedBreakStart;
      }
    }
  }

  request.status = approved ? "approved" : "rejected";
  request.reviewedBy = actor.id;
  request.reviewedAt = new Date();
  request.reviewNote = input.reviewNote?.trim() || null;
  request.updatedAt = new Date();

  const employee = userById(request.userId);
  notifications.unshift({
    id: Date.now() + Math.random(),
    userId: request.userId,
    actorId: actor.id,
    taskId: null,
    type: approved ? "time_approved" : "time_rejected",
    title: approved ? "Time adjustment approved" : "Time adjustment rejected",
    message: approved
      ? `Your ${request.type === "clock_in" ? "manual clock-in" : "break edit"} request was approved.`
      : `Your ${request.type === "clock_in" ? "manual clock-in" : "break edit"} request was rejected.${input.reviewNote ? ` Note: ${input.reviewNote.trim()}` : ""}`,
    read: false,
    createdAt: new Date(),
  } as (typeof notifications)[number] & { actorId: number });

  return { success: true, approved, employeeName: employee?.name || "Employee" };
}

export function mockUpdateBreak(
  userId: number,
  input: { id: number; startTime: string; endTime?: string | null; reason: string },
) {
  const list = workBreaksByUser[userId] ?? [];
  const existing = list.find((b) => b.id === input.id);
  if (!existing) throw new Error("Break not found");

  const startTime = new Date(input.startTime);
  const endTime = input.endTime ? new Date(input.endTime) : null;
  if (endTime && endTime <= startTime) {
    throw new Error("Break end must be after break start");
  }

  existing.startTime = startTime;
  existing.endTime = endTime;
  existing.reason = input.reason.trim();
  existing.manuallyEdited = true;
  existing.updatedAt = new Date();

  return existing;
}

export function mockGetDayHours(userId: number, dateStr: string) {
  return mockDayEntriesForUser(userId, dateStr);
}

export function mockTeamHours(input?: { date?: string; startDate?: string; endDate?: string }) {
  const dateStr = input?.date ?? localDateKey(new Date());
  return users.map((user) => {
    const day = mockDayEntriesForUser(user.id, dateStr);
    return {
      userId: user.id,
      name: user.name,
      avatar: user.avatar,
      role: user.role,
      totalHours: day.totalHours,
      entriesCount: day.entriesCount,
    };
  });
}

export function mockAdminStats() {
  const weeklyMinutes = users.reduce((sum, user) => {
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const minutes = allUserTimeEntries(user.id)
      .filter((e) => e.clockOut && e.clockIn >= weekAgo)
      .reduce((s, e) => s + (e.duration ?? 0), 0);
    return sum + minutes;
  }, 0);

  return {
    totalEmployees: users.length,
    activeProjects: projects.filter((p) => p.status === "active").length,
    totalTasks: tasks.length,
    weeklyHours: Math.round((weeklyMinutes / 60) * 10) / 10,
    activeClockIns: Object.values(workSessionsByUser).filter((s) => s.active).length,
  };
}

export function mockListTaskAttachments(taskId: number) {
  return (taskAttachments[taskId] ?? []).map(({ dataBase64: _data, ...meta }) => meta);
}

export function mockGetTaskAttachment(id: number) {
  for (const list of Object.values(taskAttachments)) {
    const found = list.find((a) => a.id === id);
    if (found) return found;
  }
  return null;
}

export function mockAddTaskAttachment(
  input: {
    taskId: number;
    fileName: string;
    mimeType: string;
    fileSize: number;
    dataBase64: string;
  },
  actor: SafeUser,
) {
  const list = taskAttachments[input.taskId] ?? (taskAttachments[input.taskId] = []);
  const id = list.reduce((max, a) => Math.max(max, a.id), 0) + 1;
  const attachment = {
    id,
    taskId: input.taskId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    dataBase64: input.dataBase64,
    uploadedBy: actor.id,
    createdAt: new Date(),
  };
  list.push(attachment);
  return attachment;
}

export function mockDeleteTaskAttachment(id: number) {
  for (const [taskId, list] of Object.entries(taskAttachments)) {
    const index = list.findIndex((a) => a.id === id);
    if (index >= 0) {
      list.splice(index, 1);
      if (list.length === 0) delete taskAttachments[Number(taskId)];
      return { success: true };
    }
  }
  throw new Error("Attachment not found");
}
