import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { isAuthDisabled } from "./lib/dev-mode";
import * as mock from "./lib/mock-store";
import {
  getCollection,
  insertDoc,
  findById,
  updateById,
  countDocs,
  hasMongoConfigured,
} from "./queries/connection";
import {
  canViewProjectTasks,
  deleteProjectMembers,
  getProjectMemberUserIds,
  isProjectMember,
  joinProject,
} from "./queries/project-members";
import { omitPasswordHash } from "./queries/users";
import { notifyLeads } from "./lib/notify-leads";
import { assertPermission } from "./lib/permissions";
import { Collections } from "@db/mongo/collections";
import type { ProjectDoc, TaskDoc, UserDoc } from "@db/mongo/types";
import { ensureSchema } from "./lib/migrate";
import {
  projectPerformancePercent,
} from "@/lib/project-funnel";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function useMock() {
  return isAuthDisabled() || !hasMongoConfigured();
}

export const projectRouter = createRouter({
  list: authedQuery
    .input(
      z.object({
        status: z.string().optional(),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      if (useMock()) return mock.mockProjectList(ctx.user.id);

      await ensureSchema();
      const { status, search } = input || {};

      const filter: Record<string, unknown> = {};
      if (status) filter.status = status;
      if (search) filter.name = new RegExp(escapeRegex(search), "i");

      const projectCol = await getCollection<ProjectDoc>(Collections.projects);
      const allProjects = await projectCol
        .find(filter)
        .sort({ createdAt: -1 })
        .toArray();

      const projectIds = allProjects.map((p) => p.id);
      const taskCol = await getCollection<TaskDoc>(Collections.tasks);
      const allTasks = projectIds.length > 0
        ? await taskCol.find({ projectId: { $in: projectIds } }).toArray()
        : [];

      const tasksByProject = new Map<number, TaskDoc[]>();
      const memberIds = new Set<number>();

      for (const task of allTasks) {
        if (task.projectId == null) continue;
        const list = tasksByProject.get(task.projectId) ?? [];
        list.push(task);
        tasksByProject.set(task.projectId, list);
        if (task.assigneeId) memberIds.add(task.assigneeId);
        if (task.createdBy) memberIds.add(task.createdBy);
      }

      for (const project of allProjects) {
        if (project.createdBy) memberIds.add(project.createdBy);
      }

      const userCol = await getCollection<UserDoc>(Collections.users);
      const memberUsers = memberIds.size > 0
        ? await userCol
            .find({ id: { $in: [...memberIds] } })
            .project({ id: 1, name: 1, avatar: 1, department: 1, position: 1 })
            .toArray()
        : [];
      const userMap = new Map(memberUsers.map((u) => [u.id, u]));

      return allProjects.map((project) => {
        const projectTasks = tasksByProject.get(project.id) ?? [];
        const taskCount = projectTasks.length;
        const completedCount = projectTasks.filter((t) => t.status === "done").length;

        const lastTaskUpdate = projectTasks.reduce<Date | null>((max, t) => {
          const d = new Date(t.updatedAt);
          if (Number.isNaN(d.getTime())) return max;
          return !max || d > max ? d : max;
        }, null);

        const projectMemberIds = new Set<number>();
        if (project.createdBy) projectMemberIds.add(project.createdBy);
        for (const t of projectTasks) {
          if (t.assigneeId) projectMemberIds.add(t.assigneeId);
          if (t.createdBy) projectMemberIds.add(t.createdBy);
        }

        const members = [...projectMemberIds]
          .map((id) => userMap.get(id))
          .filter((u): u is Pick<UserDoc, "id" | "name" | "avatar"> => Boolean(u))
          .slice(0, 6);

        const creatorUser = project.createdBy ? userMap.get(project.createdBy) : null;

        return {
          ...project,
          taskCount,
          completedCount,
          creator: creatorUser
            ? {
                id: creatorUser.id,
                name: creatorUser.name,
                avatar: creatorUser.avatar,
                department: creatorUser.department,
                position: creatorUser.position,
              }
            : null,
          performance: projectPerformancePercent(taskCount, completedCount),
          lastActiveAt: (lastTaskUpdate ?? project.updatedAt).toISOString(),
          members,
          privacyType: "Public" as const,
        };
      });
    }),

  getById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      if (useMock()) return mock.mockProjectById(input.id, ctx.user.id);

      await ensureSchema();
      const project = await findById<ProjectDoc>(Collections.projects, input.id);
      if (!project) return null;

      const joined = await isProjectMember(project.id, ctx.user.id, project.createdBy);
      const canViewTasks = canViewProjectTasks(ctx.user, project.createdBy, joined);

      const taskCol = await getCollection<TaskDoc>(Collections.tasks);
      const projectTasks = canViewTasks
        ? await taskCol.find({ projectId: project.id }).toArray()
        : [];

      const total = canViewTasks ? projectTasks.length : 0;
      const todo = canViewTasks ? projectTasks.filter((t) => t.status === "todo").length : 0;
      const inProgress = canViewTasks ? projectTasks.filter((t) => t.status === "in_progress").length : 0;
      const review = canViewTasks ? projectTasks.filter((t) => t.status === "review").length : 0;
      const done = canViewTasks ? projectTasks.filter((t) => t.status === "done").length : 0;

      const joinedMemberIds = await getProjectMemberUserIds(project.id);
      const memberIds = new Set<number>(joinedMemberIds);
      if (project.createdBy) memberIds.add(project.createdBy);
      for (const t of projectTasks) {
        if (t.assigneeId) memberIds.add(t.assigneeId);
        if (t.createdBy) memberIds.add(t.createdBy);
      }

      const hoursTracked = projectTasks.reduce(
        (sum, t) => sum + parseFloat(String(t.actualHours ?? "0")),
        0,
      );

      const dueDates = projectTasks
        .map((t) => t.dueDate)
        .filter((d): d is Date => Boolean(d))
        .sort((a, b) => a.getTime() - b.getTime());

      const creator = project.createdBy
        ? await findById<UserDoc>(Collections.users, project.createdBy)
        : null;

      return {
        ...project,
        creator: creator ? omitPasswordHash(creator) : null,
        stats: { total, todo, inProgress, review, done },
        hoursTracked: Math.round(hoursTracked * 10) / 10,
        memberCount: memberIds.size || 1,
        dueDate: dueDates[0] ?? null,
        isMember: joined,
        canViewTasks,
      };
    }),

  join: authedQuery
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (useMock()) return mock.mockJoinProject(input.projectId, ctx.user.id);

      assertPermission(ctx.user, "projects.view");
      await ensureSchema();

      const project = await findById<ProjectDoc>(Collections.projects, input.projectId);
      if (!project) {
        throw new Error("Project not found");
      }

      await joinProject(input.projectId, ctx.user.id);
      const joined = await isProjectMember(input.projectId, ctx.user.id, project.createdBy);

      return {
        success: true,
        isMember: joined,
        canViewTasks: canViewProjectTasks(ctx.user, project.createdBy, joined),
      };
    }),

  create: authedQuery
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      color: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertPermission(ctx.user, "projects.manage");
      await ensureSchema();
      const now = new Date();
      const project = await insertDoc<ProjectDoc>(Collections.projects, {
        name: input.name,
        description: input.description ?? null,
        status: "active",
        color: input.color ?? null,
        createdBy: ctx.user.id,
        createdAt: now,
        updatedAt: now,
      });

      await joinProject(project.id, ctx.user.id);

      const creatorName = ctx.user.name || ctx.user.email || "Someone";
      await notifyLeads({
        actor: ctx.user,
        type: "project_created",
        title: "New project created",
        message: `${creatorName} created project "${project.name}"`,
        projectId: project.id,
      });

      return { ...project, creator: ctx.user };
    }),

  update: authedQuery
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(["active", "archived", "completed"]).optional(),
      color: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertPermission(ctx.user, "projects.manage");
      await ensureSchema();
      const { id, ...data } = input;
      return updateById<ProjectDoc>(Collections.projects, id, {
        ...data,
        updatedAt: new Date(),
      });
    }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (useMock()) return mock.mockDeleteProject(input.id);

      assertPermission(ctx.user, "projects.manage");
      await ensureSchema();

      const project = await findById<ProjectDoc>(Collections.projects, input.id);
      if (!project) {
        throw new Error("Project not found");
      }

      const taskCol = await getCollection<TaskDoc>(Collections.tasks);
      const projectTasks = await taskCol.find({ projectId: input.id }).toArray();
      const taskIds = projectTasks.map((t) => t.id);

      if (taskIds.length > 0) {
        const taskFilter = { taskId: { $in: taskIds } };
        await Promise.all([
          getCollection(Collections.taskParticipants).then((c) => c.deleteMany(taskFilter)),
          getCollection(Collections.subtasks).then((c) => c.deleteMany(taskFilter)),
          getCollection(Collections.taskActivity).then((c) => c.deleteMany(taskFilter)),
          getCollection(Collections.taskAttachments).then((c) => c.deleteMany(taskFilter)),
          getCollection(Collections.taskTagRelations).then((c) => c.deleteMany(taskFilter)),
          getCollection(Collections.timeEntries).then((c) => c.deleteMany(taskFilter)),
          getCollection(Collections.notifications).then((c) => c.deleteMany({ taskId: { $in: taskIds } })),
        ]);
        await taskCol.deleteMany({ id: { $in: taskIds } });
      }

      await getCollection(Collections.notifications).then((c) =>
        c.deleteMany({ projectId: input.id }),
      );

      await deleteProjectMembers(input.id);

      const projectCol = await getCollection<ProjectDoc>(Collections.projects);
      await projectCol.deleteOne({ id: input.id });

      return { success: true };
    }),
});
