import { z } from "zod";
import { createRouter, authedQuery, adminQuery } from "./middleware";
import { isAuthDisabled } from "./lib/dev-mode";
import * as mock from "./lib/mock-store";
import {
  getCollection,
  countDocs,
  hasMongoConfigured,
} from "./queries/connection";
import { Collections } from "@db/mongo/collections";
import type { TaskDoc, TimeEntryDoc, UserDoc } from "@db/mongo/types";
import { ensureSchema } from "./lib/migrate";

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

export const dashboardRouter = createRouter({
  getStats: authedQuery
    .query(async ({ ctx }) => {
      if (isAuthDisabled() || !hasMongoConfigured()) {
        return mock.mockDashboardStats(ctx.user.id);
      }

      await ensureSchema();
      const userId = ctx.user.id;
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86400000);
      const taskCol = await getCollection<TaskDoc>(Collections.tasks);

      const [ongoingTasks, completedTasks, hoursTotal, performanceResult] = await Promise.all([
        taskCol.countDocuments({ assigneeId: userId, status: "in_progress" }),
        taskCol.countDocuments({ assigneeId: userId, status: "done" }),
        sumDuration({ userId, clockIn: { $gte: weekAgo } }),
        taskCol
          .aggregate<{ total: number; done: number }>([
            { $match: { assigneeId: userId } },
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                done: {
                  $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] },
                },
              },
            },
          ])
          .toArray(),
      ]);

      const totalTasks = performanceResult[0]?.total || 1;
      const doneTasks = performanceResult[0]?.done || 0;
      const completionRate = Math.round((doneTasks / totalTasks) * 100);

      return {
        ongoingTasks,
        completedTasks,
        hoursTracked: Math.round((hoursTotal / 60) * 10) / 10,
        teamPerformance: completionRate,
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
      const taskCol = await getCollection<TaskDoc>(Collections.tasks);
      const recentTasks = await taskCol
        .find({ assigneeId: ctx.user.id })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .toArray();

      const assigneeIds = [
        ...new Set(recentTasks.map((t) => t.assigneeId).filter((id): id is number => id != null)),
      ];

      const userCol = await getCollection<UserDoc>(Collections.users);
      const assignees = assigneeIds.length > 0
        ? await userCol.find({ id: { $in: assigneeIds } }).toArray()
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
      const taskCol = await getCollection<TaskDoc>(Collections.tasks);
      const days: { day: string; completed: number; created: number }[] = [];

      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);

        const [completed, created] = await Promise.all([
          taskCol.countDocuments({
            assigneeId: ctx.user.id,
            status: "done",
            updatedAt: { $gte: date, $lt: nextDay },
          }),
          taskCol.countDocuments({
            createdBy: ctx.user.id,
            createdAt: { $gte: date, $lt: nextDay },
          }),
        ]);

        days.push({
          day: date.toLocaleDateString("en-US", { weekday: "short" }),
          completed,
          created,
        });
      }

      return days;
    }),

  getWorkload: adminQuery
    .query(async () => {
      if (isAuthDisabled() || !hasMongoConfigured()) return mock.mockWorkload();

      await ensureSchema();
      const userCol = await getCollection<UserDoc>(Collections.users);
      const taskCol = await getCollection<TaskDoc>(Collections.tasks);
      const allUsers = await userCol.find({ status: "active" }).toArray();

      const workload = await Promise.all(
        allUsers.map(async (user) => {
          const [taskCount, hoursTotal] = await Promise.all([
            taskCol.countDocuments({ assigneeId: user.id, status: "in_progress" }),
            sumDuration({ userId: user.id }),
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

  getAdminStats: adminQuery
    .query(async () => {
      if (isAuthDisabled() || !hasMongoConfigured()) return mock.mockAdminStats();

      await ensureSchema();
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86400000);

      const [totalEmployees, activeProjects, totalTasks, weeklyHoursTotal, activeClockIns] =
        await Promise.all([
          countDocs(Collections.users, { status: "active" }),
          countDocs(Collections.projects, { status: "active" }),
          countDocs(Collections.tasks),
          sumDuration({ clockIn: { $gte: weekAgo } }),
          countDocs(Collections.workSessions, { active: true }),
        ]);

      return {
        totalEmployees,
        activeProjects,
        totalTasks,
        weeklyHours: Math.round((weeklyHoursTotal / 60) * 10) / 10,
        activeClockIns,
      };
    }),
});
