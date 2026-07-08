import { z } from "zod";
import { createRouter, authedQuery, adminQuery } from "./middleware";
import { isAuthDisabled } from "./lib/dev-mode";
import * as mock from "./lib/mock-store";
import { getCollection, countDocs, findById, updateById } from "./queries/connection";
import { omitPasswordHash } from "./queries/users";
import { syncEmployeeFromUser, deactivateEmployeeByUserId, createEmployeeFromUser } from "./queries/employees";
import { Collections } from "@db/mongo/collections";
import type { UserDoc } from "@db/mongo/types";
import type { TaskDoc } from "@db/mongo/types";
import type { TimeEntryDoc } from "@db/mongo/types";
import { ensureSchema } from "./lib/migrate";
import { getEmployeeDefaultPermissions } from "./lib/employee-defaults";
import { hasMongoConfigured } from "./queries/mongo";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const userRouter = createRouter({
  listForPicker: authedQuery
    .input(z.object({ limit: z.number().default(500) }).optional())
    .query(async ({ input }) => {
      if (isAuthDisabled() || !hasMongoConfigured()) return mock.mockUserList();

      await ensureSchema();
      const limit = input?.limit ?? 500;
      const filter = { status: "active" as const };
      const col = await getCollection<UserDoc>(Collections.users);
      const [allUsers, total] = await Promise.all([
        col.find(filter).sort({ name: 1, id: 1 }).limit(limit).toArray(),
        countDocs(Collections.users, filter),
      ]);

      return {
        users: allUsers.map(omitPasswordHash),
        total,
      };
    }),

  list: adminQuery
    .input(
      z.object({
        search: z.string().optional(),
        role: z.string().optional(),
        status: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      }).optional(),
    )
    .query(async ({ input }) => {
      if (isAuthDisabled() || !hasMongoConfigured()) return mock.mockUserList();

      await ensureSchema();
      const { search, role, status, page = 1, limit = 20 } = input || {};
      const skip = (page - 1) * limit;

      const filter: Record<string, unknown> = {};
      if (role) filter.role = role;
      if (status) filter.status = status;
      if (search) {
        const regex = new RegExp(escapeRegex(search), "i");
        filter.$or = [
          { name: regex },
          { email: regex },
          { department: regex },
          { position: regex },
        ];
      }

      const col = await getCollection<UserDoc>(Collections.users);
      const [allUsers, total] = await Promise.all([
        col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
        countDocs(Collections.users, filter),
      ]);

      return {
        users: allUsers.map(omitPasswordHash),
        total,
      };
    }),

  getById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const user = await findById<UserDoc>(Collections.users, input.id);
      return user ? omitPasswordHash(user) : null;
    }),

  update: adminQuery
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      role: z.enum(["admin", "manager", "employee"]).optional(),
      status: z.enum(["active", "inactive", "suspended"]).optional(),
      department: z.string().optional(),
      position: z.string().optional(),
      phone: z.string().optional(),
      permissions: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updated = await updateById<UserDoc>(Collections.users, id, {
        ...data,
        updatedAt: new Date(),
      });
      if (updated?.role === "employee") {
        await syncEmployeeFromUser(updated);
      }
      return updated ? omitPasswordHash(updated) : null;
    }),

  updateRole: adminQuery
    .input(z.object({
      id: z.number(),
      role: z.enum(["admin", "manager", "employee"]),
    }))
    .mutation(async ({ input }) => {
      const { DEFAULT_PERMISSIONS_BY_ROLE } = await import("@db/mongo/types");
      const permissions =
        input.role === "employee"
          ? await getEmployeeDefaultPermissions()
          : DEFAULT_PERMISSIONS_BY_ROLE[input.role];
      const updated = await updateById<UserDoc>(Collections.users, input.id, {
        role: input.role,
        permissions,
        updatedAt: new Date(),
      });
      if (updated) {
        if (updated.role === "employee") {
          await createEmployeeFromUser(updated);
        } else {
          await deactivateEmployeeByUserId(updated.id);
        }
      }
      return updated ? omitPasswordHash(updated) : null;
    }),

  delete: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const updated = await updateById<UserDoc>(Collections.users, input.id, {
        status: "inactive",
        updatedAt: new Date(),
      });
      if (updated) {
        await deactivateEmployeeByUserId(updated.id);
      }
      return { success: true };
    }),

  stats: authedQuery
    .input(z.object({
      id: z.number(),
      period: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { id } = input;
      const timeCol = await getCollection<TimeEntryDoc>(Collections.timeEntries);
      const taskCol = await getCollection<TaskDoc>(Collections.tasks);

      const entries = await timeCol.find({ userId: id }).toArray();
      const totalMinutes = entries.reduce((sum, e) => sum + (e.duration ?? 0), 0);

      const [tasksCompleted, tasksInProgress] = await Promise.all([
        taskCol.countDocuments({ assigneeId: id, status: "done" }),
        taskCol.countDocuments({ assigneeId: id, status: "in_progress" }),
      ]);

      return {
        totalHours: Math.round((totalMinutes / 60) * 10) / 10,
        tasksCompleted,
        tasksInProgress,
      };
    }),
});
