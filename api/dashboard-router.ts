import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "./middleware";
import { isAuthDisabled } from "./lib/dev-mode";
import { assertPermission } from "./lib/permissions";
import * as mock from "./lib/mock-store";
import {
  getCollection,
  countDocs,
  hasMongoConfigured,
} from "./queries/connection";
import { Collections } from "@db/mongo/collections";
import type {
  EmployeeDoc,
  LeaveRequestDoc,
  TaskDoc,
  TimeEntryDoc,
  UserDoc,
  WorkSessionDoc,
} from "@db/mongo/types";
import { ensureSchema } from "./lib/migrate";
import { orgFilter } from "./lib/tenant";
import { computeSessionWorkSeconds, startOfCalendarWeek } from "@/lib/work-hours-policy";
import { leaveTypeShort, isHrRoleOnly, eachLeaveDateKey, isWeekdayDateKey, isWorkFromHomeLeave } from "@/lib/leave-policy";
import {
  HR_OVERVIEW_DEPARTMENT_LABELS,
  normalizeHrOverviewDepartment,
} from "@/lib/department-options";
import {
  formatInWorkZone,
  startOfWorkZoneDay,
  workZoneDateKey,
  workZoneDateParts,
  workZoneWallTimeToUtc,
} from "@/lib/timezone";

async function sumDuration(
  filter: Record<string, unknown>,
): Promise<number> {
  const timeCol = await getCollection<TimeEntryDoc>(Collections.timeEntries);
  const result = await timeCol
    .aggregate<{ total: number }>([
      { $match: filter },
      { $group: { _id: null, total: { $sum: { $ifNull: ["$duration", 0] } } } },
    ])
    .toArray();
  return result[0]?.total ?? 0;
}

function assertHrOrAdmin(user: { role?: string | null }) {
  if (!(isHrRoleOnly(user) || user.role === "admin")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This dashboard is only available to HR and admin users",
    });
  }
}

function birthdayPartsThisYear(
  dob: Date,
  nowParts: { year: number; month: number; day: number },
) {
  const dobParts = workZoneDateParts(dob);
  let year = nowParts.year;
  const month = dobParts.month;
  const day = dobParts.day;
  // Already passed this year → next year
  if (month < nowParts.month || (month === nowParts.month && day < nowParts.day)) {
    year += 1;
  }
  return { year, month, day };
}

function daysUntilBirthday(
  dob: Date,
  nowParts: { year: number; month: number; day: number },
) {
  const next = birthdayPartsThisYear(dob, nowParts);
  const nowUtc = workZoneWallTimeToUtc(nowParts.year, nowParts.month, nowParts.day, 0, 0, 0, 0);
  const nextUtc = workZoneWallTimeToUtc(next.year, next.month, next.day, 0, 0, 0, 0);
  return Math.round((nextUtc.getTime() - nowUtc.getTime()) / 86400000);
}

function leaveTypeSummaryLabel(leaveType: string) {
  if (leaveType === "paid") return "Paid";
  if (leaveType === "sick") return "Sick";
  if (leaveType === "unpaid") return "Unpaid";
  if (leaveType === "wfh") return "Work from home";
  return "Half day";
}

type UpcomingLeaveSummaryItem = {
  id: string;
  leaveId: number;
  day: number;
  dateKey: string;
  section: "today" | "tomorrow" | "upcoming";
  name: string;
  avatar: string | null;
  leaveType: string;
  leaveTypeLabel: string;
};

async function buildLeaveSummary(
  organizationId: number,
  now: Date = new Date(),
) {
  const leaveCol = await getCollection<LeaveRequestDoc>(Collections.leaveRequests);
  const userCol = await getCollection<UserDoc>(Collections.users);
  const tenant = { organizationId };

  const todayKey = workZoneDateKey(now);
  const startToday = startOfWorkZoneDay(now);
  const startTomorrow = new Date(startToday.getTime() + 86400000);
  const tomorrowKey = workZoneDateKey(startTomorrow);
  const leaveMonthLabel = formatInWorkZone(now, { month: "long" });

  // Leaves: approved only (same as before). WFH: pending + approved so they appear in the summary.
  const leaveRequests = await leaveCol
    .find({
      ...tenant,
      status: { $in: ["approved", "pending"] },
      endDate: { $gte: todayKey },
    })
    .toArray();

  const leaveUserIds = [...new Set(leaveRequests.map((l) => l.userId))];
  const leaveUsers =
    leaveUserIds.length > 0
      ? await userCol
          .find({ id: { $in: leaveUserIds }, ...tenant })
          .project({ id: 1, name: 1, avatar: 1 })
          .toArray()
      : [];
  const leaveUserById = new Map(leaveUsers.map((u) => [u.id, u]));

  const upcomingLeaveItems: UpcomingLeaveSummaryItem[] = [];
  const upcomingWfhItems: UpcomingLeaveSummaryItem[] = [];

  for (const l of leaveRequests) {
    const isWfh = isWorkFromHomeLeave(l.leaveType);
    if (!isWfh && l.status !== "approved") continue;

    const rangeStart = l.startDate < todayKey ? todayKey : l.startDate;
    for (const dateKey of eachLeaveDateKey(rangeStart, l.endDate)) {
      if (!isWeekdayDateKey(dateKey) || dateKey < todayKey) continue;

      const user = leaveUserById.get(l.userId);
      const section =
        dateKey === todayKey
          ? "today"
          : dateKey === tomorrowKey
            ? "tomorrow"
            : "upcoming";

      const item: UpcomingLeaveSummaryItem = {
        id: `${l.id}-${dateKey}`,
        leaveId: l.id,
        day: Number(dateKey.slice(8, 10)),
        dateKey,
        section,
        name: user?.name || "Employee",
        avatar: user?.avatar ?? null,
        leaveType: leaveTypeShort(l.leaveType),
        leaveTypeLabel: leaveTypeSummaryLabel(l.leaveType),
      };

      if (isWfh) {
        upcomingWfhItems.push(item);
      } else {
        upcomingLeaveItems.push(item);
      }
    }
  }

  upcomingLeaveItems.sort(
    (a, b) => a.dateKey.localeCompare(b.dateKey) || a.name.localeCompare(b.name),
  );
  upcomingWfhItems.sort(
    (a, b) => a.dateKey.localeCompare(b.dateKey) || a.name.localeCompare(b.name),
  );

  return {
    leaveMonthLabel,
    upcomingLeaves: upcomingLeaveItems,
    upcomingWfh: upcomingWfhItems,
  };
}

export const dashboardRouter = createRouter({
  getStats: authedQuery
    .query(async ({ ctx }) => {
      if (isAuthDisabled() || !hasMongoConfigured()) {
        return mock.mockDashboardStats(ctx.user.id, ctx.user.role);
      }

      await ensureSchema();
      const userId = ctx.user.id;
      const tenant = orgFilter(ctx.user);
      const isAdminOrManager =
        ctx.user.role === "admin" || ctx.user.role === "manager";
      const startOfToday = startOfWorkZoneDay(new Date());
      const taskCol = await getCollection<TaskDoc>(Collections.tasks);

      const taskFilter = isAdminOrManager
        ? { ...tenant }
        : { ...tenant, assigneeId: userId };

      const [ongoingTasks, completedTasks, hoursTotal] = await Promise.all([
        taskCol.countDocuments({ ...taskFilter, status: "todo" }),
        taskCol.countDocuments({ ...taskFilter, status: "done" }),
        sumDuration({ ...tenant, userId, clockIn: { $gte: startOfToday } }),
      ]);

      return {
        ongoingTasks,
        completedTasks,
        hoursTracked: Math.round((hoursTotal / 60) * 10) / 10,
      };
    }),

  getRecentTasks: authedQuery
    .input(z.object({ limit: z.number().default(10) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit || 10;
      if (isAuthDisabled() || !hasMongoConfigured()) {
        return mock.mockRecentTasks(ctx.user.id, limit);
      }

      await ensureSchema();
      const tenant = orgFilter(ctx.user);
      const taskCol = await getCollection<TaskDoc>(Collections.tasks);
      const recentTasks = await taskCol
        .find({ ...tenant, assigneeId: ctx.user.id })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .toArray();

      const assigneeIds = [
        ...new Set(recentTasks.map((t) => t.assigneeId).filter((id): id is number => id != null)),
      ];

      const userCol = await getCollection<UserDoc>(Collections.users);
      const assignees = assigneeIds.length > 0
        ? await userCol.find({ id: { $in: assigneeIds }, ...tenant }).toArray()
        : [];

      return recentTasks.map((task) => ({
        ...task,
        assignee: assignees.find((a) => a.id === task.assigneeId) || null,
      }));
    }),

  getWeeklyActivity: authedQuery
    .query(async ({ ctx }) => {
      if (isAuthDisabled() || !hasMongoConfigured()) return mock.mockWeeklyActivity();

      await ensureSchema();
      const tenant = orgFilter(ctx.user);
      const taskCol = await getCollection<TaskDoc>(Collections.tasks);
      const days: { day: string; completed: number; created: number }[] = [];

      for (let i = 6; i >= 0; i--) {
        const parts = workZoneDateParts(new Date());
        const date = workZoneWallTimeToUtc(parts.year, parts.month, parts.day - i, 0, 0, 0, 0);
        const nextDay = workZoneWallTimeToUtc(
          parts.year,
          parts.month,
          parts.day - i + 1,
          0,
          0,
          0,
          0,
        );

        const [completed, created] = await Promise.all([
          taskCol.countDocuments({
            ...tenant,
            assigneeId: ctx.user.id,
            status: "done",
            updatedAt: { $gte: date, $lt: nextDay },
          }),
          taskCol.countDocuments({
            ...tenant,
            createdBy: ctx.user.id,
            createdAt: { $gte: date, $lt: nextDay },
          }),
        ]);

        days.push({
          day: formatInWorkZone(date, { weekday: "short" }),
          completed,
          created,
        });
      }

      return days;
    }),

  getWorkload: authedQuery
    .query(async ({ ctx }) => {
      assertPermission(ctx.user, "analytics.view");

      if (isAuthDisabled() || !hasMongoConfigured()) return mock.mockWorkload();

      await ensureSchema();
      const userCol = await getCollection<UserDoc>(Collections.users);
      const taskCol = await getCollection<TaskDoc>(Collections.tasks);
      const allUsers = await userCol
        .find({ status: "active", ...orgFilter(ctx.user) })
        .toArray();
      const weekStart = startOfCalendarWeek();

      const workload = await Promise.all(
        allUsers.map(async (user) => {
          const [taskCount, hoursTotal] = await Promise.all([
            taskCol.countDocuments({
              assigneeId: user.id,
              status: "in_progress",
              ...orgFilter(ctx.user),
            }),
            sumDuration({
              userId: user.id,
              clockIn: { $gte: weekStart },
              ...orgFilter(ctx.user),
            }),
          ]);

          return {
            userId: user.id,
            name: user.name || "Unknown",
            avatar: user.avatar,
            role: user.role,
            taskCount,
            hoursLogged: Math.round((hoursTotal / 60) * 10) / 10,
          };
        })
      );

      return workload;
    }),

  getAdminStats: authedQuery
    .query(async ({ ctx }) => {
      assertPermission(ctx.user, "analytics.view");

      if (isAuthDisabled() || !hasMongoConfigured()) return mock.mockAdminStats();

      await ensureSchema();
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86400000);
      const sessionCol = await getCollection<WorkSessionDoc>(Collections.workSessions);
      const tenant = orgFilter(ctx.user);

      const [totalEmployees, activeProjects, totalTasks, weeklyHoursTotal, activeClockInUserIds] =
        await Promise.all([
          countDocs(Collections.users, { status: "active", ...tenant }),
          countDocs(Collections.projects, { status: "active", ...tenant }),
          countDocs(Collections.tasks, tenant),
          sumDuration({ clockIn: { $gte: weekAgo }, ...tenant }),
          sessionCol.distinct("userId", { active: true }),
        ]);

      // Only count active sessions for users in this organization.
      const userCol = await getCollection<UserDoc>(Collections.users);
      const orgUserIds = new Set(
        (
          await userCol
            .find({ id: { $in: activeClockInUserIds }, ...tenant })
            .project({ id: 1 })
            .toArray()
        ).map((u) => u.id),
      );
      const activeClockIns = activeClockInUserIds.filter((id) => orgUserIds.has(id)).length;

      return {
        totalEmployees,
        activeProjects,
        totalTasks,
        weeklyHours: Math.round((weeklyHoursTotal / 60) * 10) / 10,
        activeClockIns,
      };
    }),

  /** Counts of tasks assigned to employees, grouped by status. */
  getAssignedTaskStatusCounts: authedQuery.query(async ({ ctx }) => {
    assertPermission(ctx.user, "analytics.view");

    if (isAuthDisabled() || !hasMongoConfigured()) {
      return mock.mockAssignedTaskStatusCounts();
    }

    await ensureSchema();
    const tenant = orgFilter(ctx.user);
    const taskCol = await getCollection<TaskDoc>(Collections.tasks);
    const assigned = await taskCol
      .find(
        { ...tenant, assigneeId: { $gt: 0 } },
        { projection: { status: 1, _id: 0 } },
      )
      .toArray();

    const counts = { todo: 0, in_progress: 0, review: 0, done: 0 };
    for (const task of assigned) {
      if (task.status in counts) {
        counts[task.status as keyof typeof counts] += 1;
      }
    }

    return [
      { name: "To Do", value: counts.todo, status: "todo" as const },
      { name: "In Progress", value: counts.in_progress, status: "in_progress" as const },
      { name: "Review", value: counts.review, status: "review" as const },
      { name: "Done", value: counts.done, status: "done" as const },
    ];
  }),

  /** Employees currently clocked in (active work sessions). */
  getActiveClockIns: authedQuery.query(async ({ ctx }) => {
    assertPermission(ctx.user, "analytics.view");

    if (isAuthDisabled() || !hasMongoConfigured()) {
      return mock.mockActiveClockIns();
    }

    await ensureSchema();
    const tenant = orgFilter(ctx.user);
    const sessionCol = await getCollection<WorkSessionDoc>(Collections.workSessions);
    const userCol = await getCollection<UserDoc>(Collections.users);

    const sessions = await sessionCol
      .find({ active: true })
      .sort({ startTime: 1 })
      .toArray();

    if (sessions.length === 0) return [];

    // Duplicate active sessions can exist for one user; keep one row per employee.
    const sessionByUserId = new Map<number, (typeof sessions)[number]>();
    for (const session of sessions) {
      const existing = sessionByUserId.get(session.userId);
      if (!existing) {
        sessionByUserId.set(session.userId, session);
        continue;
      }
      const existingStart = new Date(existing.startTime).getTime();
      const sessionStart = new Date(session.startTime).getTime();
      if (
        sessionStart < existingStart ||
        (sessionStart === existingStart && session.id < existing.id)
      ) {
        sessionByUserId.set(session.userId, session);
      }
    }
    const uniqueSessions = [...sessionByUserId.values()].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

    const userIds = uniqueSessions.map((s) => s.userId);
    const users = await userCol
      .find({ id: { $in: userIds }, ...tenant })
      .toArray();
    const userById = new Map(users.map((u) => [u.id, u]));

    return uniqueSessions
      .filter((session) => userById.has(session.userId))
      .map((session) => {
        const user = userById.get(session.userId)!;
        return {
          sessionId: session.id,
          userId: session.userId,
          name: user.name || "Unknown",
          avatar: user.avatar ?? null,
          role: user.role ?? "employee",
          department: user.department ?? null,
          startTime: session.startTime,
          paused: !!session.paused,
          workElapsedSeconds: computeSessionWorkSeconds(session),
        };
      });
  }),

  /** Workforce overview for the HR dashboard and admin dashboard detail cards. */
  getHrDashboard: authedQuery.query(async ({ ctx }) => {
    assertHrOrAdmin(ctx.user);

    if (isAuthDisabled() || !hasMongoConfigured()) {
      return mock.mockHrDashboard();
    }

    await ensureSchema();
    const tenant = orgFilter(ctx.user);
    const userCol = await getCollection<UserDoc>(Collections.users);
    const sessionCol = await getCollection<WorkSessionDoc>(Collections.workSessions);
    const leaveCol = await getCollection<LeaveRequestDoc>(Collections.leaveRequests);
    const employeeCol = await getCollection<EmployeeDoc>(Collections.employees);

    const now = new Date();
    const todayKey = workZoneDateKey(now);
    const nowParts = workZoneDateParts(now);
    const startToday = startOfWorkZoneDay(now);
    const startTomorrow = new Date(startToday.getTime() + 86400000);
    const thisMonthStartDate = workZoneWallTimeToUtc(
      nowParts.year,
      nowParts.month,
      1,
      0,
      0,
      0,
      0,
    );
    const lastMonthStartParts = {
      year: nowParts.month === 1 ? nowParts.year - 1 : nowParts.year,
      month: nowParts.month === 1 ? 12 : nowParts.month - 1,
    };
    const lastMonthStartDate = workZoneWallTimeToUtc(
      lastMonthStartParts.year,
      lastMonthStartParts.month,
      1,
      0,
      0,
      0,
      0,
    );

    const [activeUsers, employeeRows] = await Promise.all([
      userCol
        .find({ status: "active", ...tenant })
        .project({
          id: 1,
          name: 1,
          avatar: 1,
          department: 1,
          position: 1,
          role: 1,
          dateOfBirth: 1,
          createdAt: 1,
        })
        .toArray(),
      employeeCol
        .find({ ...tenant })
        .project({
          userId: 1,
          dateOfBirth: 1,
          joinedAt: 1,
          department: 1,
          position: 1,
          name: 1,
          avatar: 1,
        })
        .toArray(),
    ]);

    const employeeByUserId = new Map(employeeRows.map((e) => [e.userId, e]));
    const orgUserIds = new Set(activeUsers.map((u) => u.id));
    const totalEmployees = activeUsers.length;

    // Anyone with a work session that started today (including already clocked out),
    // plus anyone still actively clocked in from an earlier day.
    const [sessionsToday, activeSessions] = await Promise.all([
      sessionCol
        .find({
          userId: { $in: [...orgUserIds] },
          startTime: { $gte: startToday, $lt: startTomorrow },
        })
        .project({ userId: 1 })
        .toArray(),
      sessionCol
        .find({ userId: { $in: [...orgUserIds] }, active: true })
        .project({ userId: 1 })
        .toArray(),
    ]);
    const presentIds = new Set<number>([
      ...sessionsToday.map((s) => s.userId),
      ...activeSessions.map((s) => s.userId),
    ]);
    const presentToday = presentIds.size;

    const approvedLeaves = await leaveCol
      .find({ status: "approved", ...tenant })
      .toArray();
    const onLeaveToday = new Set(
      approvedLeaves
        .filter((l) => l.startDate <= todayKey && l.endDate >= todayKey)
        .map((l) => l.userId),
    ).size;

    const yesterdayUtc = new Date(startToday.getTime() - 86400000);
    const yesterdayKey = workZoneDateKey(yesterdayUtc);
    const startYesterday = startOfWorkZoneDay(yesterdayUtc);
    const sessionsYesterday = await sessionCol
      .find({
        userId: { $in: [...orgUserIds] },
        startTime: { $gte: startYesterday, $lt: startToday },
      })
      .project({ userId: 1 })
      .toArray();
    const presentYesterday = new Set(sessionsYesterday.map((s) => s.userId)).size;
    const onLeaveYesterday = new Set(
      approvedLeaves
        .filter((l) => l.startDate <= yesterdayKey && l.endDate >= yesterdayKey)
        .map((l) => l.userId),
    ).size;

    const joinDateFor = (user: (typeof activeUsers)[number]) => {
      const emp = employeeByUserId.get(user.id);
      return emp?.joinedAt ?? user.createdAt;
    };

    const newJoinersThisMonth = activeUsers.filter(
      (u) => joinDateFor(u) >= thisMonthStartDate,
    ).length;
    const newJoinersLastMonth = activeUsers.filter((u) => {
      const joined = joinDateFor(u);
      return joined >= lastMonthStartDate && joined < thisMonthStartDate;
    }).length;

    const deptCounts = new Map<string, number>();
    for (const label of HR_OVERVIEW_DEPARTMENT_LABELS) {
      deptCounts.set(label, 0);
    }
    let staffInOverview = 0;
    for (const u of activeUsers) {
      const fromEmp = employeeByUserId.get(u.id)?.department;
      const label = normalizeHrOverviewDepartment(fromEmp ?? u.department);
      if (!label) continue;
      deptCounts.set(label, (deptCounts.get(label) ?? 0) + 1);
      staffInOverview += 1;
    }
    const departmentsCount = HR_OVERVIEW_DEPARTMENT_LABELS.filter(
      (label) => (deptCounts.get(label) ?? 0) > 0,
    ).length;

    const byDepartment = HR_OVERVIEW_DEPARTMENT_LABELS
      .map((name) => {
        const count = deptCounts.get(name) ?? 0;
        return {
          name,
          count,
          percent:
            staffInOverview > 0 ? Math.round((count / staffInOverview) * 100) : 0,
        };
      })
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count);

    const leaveSummary = await buildLeaveSummary(tenant.organizationId, now);

    const recentJoiners = [...activeUsers]
      .sort((a, b) => joinDateFor(b).getTime() - joinDateFor(a).getTime())
      .slice(0, 5)
      .map((u) => {
        const joined = joinDateFor(u);
        const emp = employeeByUserId.get(u.id);
        return {
          id: u.id,
          name: u.name || emp?.name || "Employee",
          avatar: u.avatar ?? emp?.avatar ?? null,
          position:
            (emp?.position || u.position || emp?.department || u.department || "Team member").trim(),
          joinedAt: joined,
          joinedLabel: formatInWorkZone(joined, {
            day: "numeric",
            month: "short",
            year: "numeric",
          }),
        };
      });

    const dobByUserId = new Map<number, Date>();
    for (const u of activeUsers) {
      if (u.dateOfBirth) dobByUserId.set(u.id, u.dateOfBirth);
    }
    for (const emp of employeeRows) {
      if (emp.dateOfBirth && !dobByUserId.has(emp.userId)) {
        dobByUserId.set(emp.userId, emp.dateOfBirth);
      }
    }

    const upcomingBirthdays = activeUsers
      .filter((u) => dobByUserId.has(u.id))
      .map((u) => {
        const dob = dobByUserId.get(u.id)!;
        const daysLeft = daysUntilBirthday(dob, nowParts);
        const next = birthdayPartsThisYear(dob, nowParts);
        const emp = employeeByUserId.get(u.id);
        return {
          id: u.id,
          name: u.name || emp?.name || "Employee",
          avatar: u.avatar ?? emp?.avatar ?? null,
          position:
            (emp?.position || u.position || emp?.department || u.department || "Team member").trim(),
          daysLeft,
          dateLabel: formatInWorkZone(
            workZoneWallTimeToUtc(next.year, next.month, next.day, 12, 0, 0, 0),
            { day: "numeric", month: "short" },
          ),
        };
      })
      .filter((b) => b.daysLeft <= 90)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 6);

    const presentPct =
      totalEmployees > 0 ? Math.round((presentToday / totalEmployees) * 100) : 0;
    const onLeavePct =
      totalEmployees > 0 ? Math.round((onLeaveToday / totalEmployees) * 100) : 0;

    const presentDeltaPct =
      presentYesterday > 0
        ? Math.round(((presentToday - presentYesterday) / presentYesterday) * 100)
        : presentToday > 0
          ? 100
          : 0;
    const onLeaveDeltaPct =
      onLeaveYesterday > 0
        ? Math.round(((onLeaveToday - onLeaveYesterday) / onLeaveYesterday) * 100)
        : onLeaveToday > 0
          ? 100
          : 0;
    const joinersDelta = newJoinersThisMonth - newJoinersLastMonth;

    return {
      totalEmployees,
      presentToday,
      presentPct,
      presentDeltaPct,
      onLeaveToday,
      onLeavePct,
      onLeaveDeltaPct,
      newJoinersThisMonth,
      joinersDelta,
      departmentsCount,
      overviewStaffTotal: staffInOverview,
      byDepartment,
      leaveMonthLabel: leaveSummary.leaveMonthLabel,
      upcomingLeaves: leaveSummary.upcomingLeaves,
      upcomingWfh: leaveSummary.upcomingWfh,
      recentJoiners,
      upcomingBirthdays,
    };
  }),

  /** Upcoming leave summary (Today / Tomorrow / Upcoming) for any signed-in user. */
  getLeaveSummary: authedQuery.query(async ({ ctx }) => {
    if (isAuthDisabled() || !hasMongoConfigured()) {
      return mock.mockLeaveSummary();
    }
    await ensureSchema();
    return buildLeaveSummary(orgFilter(ctx.user).organizationId, new Date());
  }),
});
