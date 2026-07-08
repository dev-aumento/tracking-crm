import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { isAuthDisabled } from "./lib/dev-mode";
import * as mock from "./lib/mock-store";
import { ensureSchema } from "./lib/migrate";
import {
  getCollection,
  insertDoc,
  findById,
  updateById,
  countDocs,
  hasMongoConfigured,
} from "./queries/connection";
import { omitPasswordHash } from "./queries/users";
import { notifyLeads } from "./lib/notify-leads";
import { notifyTaskMembers } from "./lib/notify-task-members";
import { assertPermission, hasPermission } from "./lib/permissions";
import { isProjectMember, canViewProjectTasks } from "./queries/project-members";
import { Collections } from "@db/mongo/collections";
import type {
  UserDoc,
  TaskDoc,
  SubtaskDoc,
  TaskParticipantDoc,
  TaskActivityDoc,
  ProjectDoc,
  TimeEntryDoc,
  TaskAttachmentDoc,
  NotificationDoc,
  SafeUser,
} from "@db/mongo/types";
import { PROJECT_PIPELINE_STAGE_KEYS } from "@/lib/task-kanban";

const projectStageSchema = z.enum(
  PROJECT_PIPELINE_STAGE_KEYS as [string, ...string[]],
);

function useTaskMock() {
  return isAuthDisabled() || !hasMongoConfigured();
}

function actorLabel(user: SafeUser) {
  return user.name || user.email || "Someone";
}

function canManageTaskTime(user: SafeUser, task: TaskDoc): boolean {
  return (
    user.role === "admin"
    || user.role === "manager"
    || task.createdBy === user.id
    || task.assigneeId === user.id
  );
}

function canEditTaskTimeEntry(user: SafeUser, task: TaskDoc, entry: TimeEntryDoc): boolean {
  return canManageTaskTime(user, task) || entry.userId === user.id;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function findUsersByIds(ids: number[]): Promise<Map<number, SafeUser>> {
  if (ids.length === 0) return new Map();
  const col = await getCollection<UserDoc>(Collections.users);
  const users = await col.find({ id: { $in: ids } }).toArray();
  return new Map(users.map((u) => [u.id, omitPasswordHash(u)]));
}

function attachmentMeta(doc: TaskAttachmentDoc) {
  const { dataBase64: _, ...meta } = doc;
  return meta;
}

export const taskRouter = createRouter({
  list: authedQuery
    .input(
      z.object({
        status: z.string().optional(),
        priority: z.string().optional(),
        assigneeId: z.number().optional(),
        projectId: z.number().nullable().optional(),
        search: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(50),
      }).optional(),
    )
    .query(async ({ input, ctx }) => {
      if (useTaskMock()) return mock.mockTaskList(input || undefined, ctx.user);

      await ensureSchema();
      const { status, priority, assigneeId, projectId, search, page = 1, limit = 50 } = input || {};

      if (projectId != null) {
        const project = await findById<ProjectDoc>(Collections.projects, projectId);
        if (!project) {
          return { tasks: [], total: 0 };
        }

        const joined = await isProjectMember(projectId, ctx.user.id, project.createdBy);
        if (!canViewProjectTasks(ctx.user, project.createdBy, joined)) {
          return { tasks: [], total: 0 };
        }
      }

      const skip = (page - 1) * limit;

      const filter: Record<string, unknown> = {};
      if (status) filter.status = status;
      if (priority) filter.priority = priority;
      if (assigneeId) filter.assigneeId = assigneeId;
      if (projectId !== undefined && projectId !== null) filter.projectId = projectId;
      if (search) filter.title = new RegExp(escapeRegex(search), "i");

      const taskCol = await getCollection<TaskDoc>(Collections.tasks);
      const [allTasks, total] = await Promise.all([
        taskCol.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
        countDocs(Collections.tasks, filter),
      ]);

      const taskIds = allTasks.map((t) => t.id);
      const participantCol = await getCollection<TaskParticipantDoc>(Collections.taskParticipants);
      const allParticipants = taskIds.length > 0
        ? await participantCol.find({ taskId: { $in: taskIds } }).toArray()
        : [];

      const assigneeIds = allTasks
        .map((t) => t.assigneeId)
        .filter((id): id is number => id != null);
      const creatorIds = allTasks
        .map((t) => t.createdBy)
        .filter((id): id is number => id != null);
      const userIds = [...new Set([...assigneeIds, ...creatorIds])];
      const userMap = await findUsersByIds(userIds);

      const projectIds = [
        ...new Set(
          allTasks
            .map((t) => t.projectId)
            .filter((id): id is number => id != null),
        ),
      ];
      const projectCol = await getCollection<ProjectDoc>(Collections.projects);
      const projectDocs =
        projectIds.length > 0
          ? await projectCol
              .find({ id: { $in: projectIds } })
              .project({ id: 1, name: 1, color: 1 })
              .toArray()
          : [];
      const projectMap = new Map(projectDocs.map((p) => [p.id, p]));

      const tasksWithAssignees = allTasks.map((task) => ({
        ...task,
        assignee: task.assigneeId ? userMap.get(task.assigneeId) ?? null : null,
        creator: task.createdBy ? userMap.get(task.createdBy) ?? null : null,
        project: task.projectId
          ? projectMap.get(task.projectId) ?? null
          : null,
        participantIds: allParticipants
          .filter((p) => p.taskId === task.id && p.role === "participant")
          .map((p) => p.userId),
        observerIds: allParticipants
          .filter((p) => p.taskId === task.id && p.role === "observer")
          .map((p) => p.userId),
      }));

      return { tasks: tasksWithAssignees, total };
    }),

  getById: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      if (useTaskMock()) return mock.mockTaskById(input.id);

      await ensureSchema();
      const task = await findById<TaskDoc>(Collections.tasks, input.id);
      if (!task) return null;

      const subtaskCol = await getCollection<SubtaskDoc>(Collections.subtasks);
      const participantCol = await getCollection<TaskParticipantDoc>(Collections.taskParticipants);
      const activityCol = await getCollection<TaskActivityDoc>(Collections.taskActivity);
      const attachmentCol = await getCollection<TaskAttachmentDoc>(Collections.taskAttachments);

      const [subtasksList, participants, activities, attachmentsList] = await Promise.all([
        subtaskCol.find({ taskId: task.id }).sort({ position: 1 }).toArray(),
        participantCol.find({ taskId: task.id }).toArray(),
        activityCol.find({ taskId: task.id }).sort({ createdAt: -1 }).toArray(),
        attachmentCol.find({ taskId: task.id }).sort({ createdAt: -1 }).toArray(),
      ]);

      const userIds = new Set<number>();
      if (task.assigneeId) userIds.add(task.assigneeId);
      if (task.createdBy) userIds.add(task.createdBy);
      for (const p of participants) userIds.add(p.userId);
      for (const a of activities) {
        if (a.userId) userIds.add(a.userId);
      }

      const [userMap, project] = await Promise.all([
        findUsersByIds([...userIds]),
        task.projectId
          ? findById<ProjectDoc>(Collections.projects, task.projectId)
          : Promise.resolve(null),
      ]);

      const participantUsers = participants
        .filter((p) => p.role === "participant")
        .map((p) => userMap.get(p.userId))
        .filter((u): u is SafeUser => u != null);

      const observerUsers = participants
        .filter((p) => p.role === "observer")
        .map((p) => userMap.get(p.userId))
        .filter((u): u is SafeUser => u != null);

      return {
        ...task,
        assignee: task.assigneeId ? userMap.get(task.assigneeId) ?? null : null,
        creator: task.createdBy ? userMap.get(task.createdBy) ?? null : null,
        project,
        subtasks: subtasksList,
        attachments: attachmentsList.map(attachmentMeta),
        participants: participantUsers,
        observers: observerUsers,
        activities: activities.map((a) => ({
          ...a,
          user: a.userId ? userMap.get(a.userId) ?? null : null,
        })),
      };
    }),

  getTimeTracked: authedQuery
    .input(z.object({ taskId: z.number() }))
    .query(async ({ input }) => {
      if (useTaskMock()) return mock.mockTaskTimeTracked(input.taskId);

      await ensureSchema();
      const timeCol = await getCollection<TimeEntryDoc>(Collections.timeEntries);
      const entries = await timeCol
        .find({ taskId: input.taskId })
        .sort({ clockIn: -1 })
        .toArray();

      const userIds = [...new Set(entries.map((e) => e.userId))];
      const userMap = await findUsersByIds(userIds);

      const totalSeconds = entries.reduce((sum, e) => {
        if (e.clockIn && e.clockOut) {
          return sum + Math.max(0, Math.floor((e.clockOut.getTime() - e.clockIn.getTime()) / 1000));
        }
        return sum + (e.duration ?? 0) * 60;
      }, 0);

      return {
        totalMinutes: Math.round(totalSeconds / 60),
        totalSeconds,
        entries: entries.map((e) => ({
          ...e,
          user: userMap.get(e.userId) ?? null,
          durationSeconds: e.clockIn && e.clockOut
            ? Math.max(0, Math.floor((e.clockOut.getTime() - e.clockIn.getTime()) / 1000))
            : (e.duration ?? 0) * 60,
        })),
      };
    }),

  create: authedQuery
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      assigneeId: z.number().optional(),
      projectId: z.number().nullable().optional(),
      dueDate: z.string().optional(),
      estimatedHours: z.number().optional(),
      tags: z.array(z.string()).optional(),
      stage: projectStageSchema.optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertPermission(ctx.user, "tasks.create");

      if (useTaskMock()) {
        return mock.mockCreateTask(input, ctx.user);
      }

      await ensureSchema();
      const { tags, ...taskData } = input;
      const now = new Date();

      const newTask = await insertDoc<TaskDoc>(Collections.tasks, {
        title: taskData.title,
        description: taskData.description ?? null,
        status: "todo",
        stage: taskData.stage ?? "new",
        priority: taskData.priority ?? "medium",
        assigneeId: taskData.assigneeId ?? null,
        projectId: taskData.projectId ?? null,
        createdBy: ctx.user.id,
        dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null,
        estimatedHours: taskData.estimatedHours != null ? String(taskData.estimatedHours) : null,
        actualHours: null,
        position: 0,
        createdAt: now,
        updatedAt: now,
      });

      await insertDoc<TaskActivityDoc>(Collections.taskActivity, {
        taskId: newTask.id,
        userId: ctx.user.id,
        action: "created",
        oldValue: null,
        newValue: taskData.title,
        metadata: tags?.length ? { tags } : null,
        createdAt: now,
      });

      if (taskData.assigneeId && taskData.assigneeId !== ctx.user.id) {
        await notifyTaskMembers({
          taskId: newTask.id,
          actor: ctx.user,
          type: "task_assigned",
          title: "New task assigned",
          message: `${actorLabel(ctx.user)} created "${taskData.title}" and assigned it to you`,
        });
      }

      const creatorName = ctx.user.name || ctx.user.email || "Someone";
      await notifyLeads({
        actor: ctx.user,
        type: "task_created",
        title: "New task created",
        message: `${creatorName} created "${taskData.title}"`,
        taskId: newTask.id,
        excludeUserIds: taskData.assigneeId ? [taskData.assigneeId] : [],
      });

      return { ...newTask, creator: ctx.user };
    }),

  update: authedQuery
    .input(z.object({
      id: z.number(),
      description: z.string().optional(),
      status: z.enum(["todo", "in_progress", "review", "done"]).optional(),
      stage: projectStageSchema.optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      assigneeId: z.number().nullable().optional(),
      createdBy: z.number().nullable().optional(),
      projectId: z.number().nullable().optional(),
      dueDate: z.string().nullable().optional(),
      estimatedHours: z.number().optional(),
      actualHours: z.number().optional(),
      position: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (useTaskMock()) {
        const { id, ...data } = input;
        const updated = mock.mockUpdateTask(id, data, ctx.user);
        if (!updated) throw new Error("Task not found");
        return updated;
      }

      await ensureSchema();
      const { id, ...data } = input;

      const oldTask = await findById<TaskDoc>(Collections.tasks, id);
      if (!oldTask) throw new Error("Task not found");

      const patch: Partial<TaskDoc> = { updatedAt: new Date() };
      if (data.description !== undefined) patch.description = data.description;
      if (data.status !== undefined) patch.status = data.status;
      if (data.priority !== undefined) patch.priority = data.priority;
      if (data.assigneeId !== undefined) patch.assigneeId = data.assigneeId;
      if (data.projectId !== undefined) patch.projectId = data.projectId;
      if (data.position !== undefined) patch.position = data.position;
      if (data.dueDate !== undefined) {
        patch.dueDate = data.dueDate ? new Date(data.dueDate) : null;
      }
      if (data.estimatedHours !== undefined) {
        patch.estimatedHours = String(data.estimatedHours);
      }
      if (data.actualHours !== undefined) {
        patch.actualHours = String(data.actualHours);
      }
      if (
        data.createdBy !== undefined &&
        (ctx.user.role === "admin" || ctx.user.role === "manager")
      ) {
        patch.createdBy = data.createdBy;
      }

      if (data.stage) {
        patch.stage = data.stage;
        if (data.stage === "finished") {
          patch.status = "done";
        } else if (oldTask.status === "done") {
          patch.status = "in_progress";
        }
      }

      const updated = await updateById<TaskDoc>(Collections.tasks, id, patch);
      if (!updated) throw new Error("Task not found");

      const now = new Date();
      const label = actorLabel(ctx.user);
      const taskTitle = oldTask.title;

      if (data.status && data.status !== oldTask.status) {
        await insertDoc<TaskActivityDoc>(Collections.taskActivity, {
          taskId: id,
          userId: ctx.user.id,
          action: "status_changed",
          oldValue: oldTask.status,
          newValue: data.status,
          metadata: null,
          createdAt: now,
        });
        await notifyTaskMembers({
          taskId: id,
          actor: ctx.user,
          type: "task_updated",
          title: "Task status changed",
          message: `${label} changed "${taskTitle}" to ${data.status.replace(/_/g, " ")}`,
        });
      }

      if (data.stage && data.stage !== oldTask.stage) {
        await insertDoc<TaskActivityDoc>(Collections.taskActivity, {
          taskId: id,
          userId: ctx.user.id,
          action: "stage_changed",
          oldValue: oldTask.stage,
          newValue: data.stage,
          metadata: null,
          createdAt: now,
        });
        await notifyTaskMembers({
          taskId: id,
          actor: ctx.user,
          type: "task_updated",
          title: "Task stage changed",
          message: `${label} moved "${taskTitle}" to ${data.stage}`,
        });
      }

      if (data.assigneeId !== undefined && data.assigneeId !== oldTask.assigneeId) {
        await insertDoc<TaskActivityDoc>(Collections.taskActivity, {
          taskId: id,
          userId: ctx.user.id,
          action: "assigned",
          oldValue: oldTask.assigneeId != null ? String(oldTask.assigneeId) : null,
          newValue: data.assigneeId != null ? String(data.assigneeId) : null,
          metadata: null,
          createdAt: now,
        });

        if (data.assigneeId) {
          const assignee = await findById<UserDoc>(Collections.users, data.assigneeId);
          await notifyTaskMembers({
            taskId: id,
            actor: ctx.user,
            type: "task_assigned",
            title: "Task reassigned",
            message: `${label} assigned "${taskTitle}" to ${assignee?.name ?? assignee?.email ?? "someone"}`,
          });
        } else {
          await notifyTaskMembers({
            taskId: id,
            actor: ctx.user,
            type: "task_updated",
            title: "Task updated",
            message: `${label} removed the assignee from "${taskTitle}"`,
          });
        }
      }

      const otherFieldsChanged =
        (data.description !== undefined && data.description !== oldTask.description)
        || (data.priority !== undefined && data.priority !== oldTask.priority)
        || (data.dueDate !== undefined)
        || (data.projectId !== undefined && data.projectId !== oldTask.projectId);

      if (
        otherFieldsChanged
        && !data.status
        && !data.stage
        && data.assigneeId === undefined
      ) {
        await notifyTaskMembers({
          taskId: id,
          actor: ctx.user,
          type: "task_updated",
          title: "Task updated",
          message: `${label} updated "${taskTitle}"`,
        });
      }

      return updated;
    }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (useTaskMock()) return mock.mockDeleteTask(input.id, ctx.user);

      await ensureSchema();
      const task = await findById<TaskDoc>(Collections.tasks, input.id);
      if (!task) throw new Error("Task not found");

      if (task.createdBy !== ctx.user.id && ctx.user.role === "employee") {
        throw new Error("Not authorized to delete this task");
      }

      const taskCol = await getCollection<TaskDoc>(Collections.tasks);
      await taskCol.deleteOne({ id: input.id });
      return { success: true };
    }),

  updateStatus: authedQuery
    .input(z.object({ id: z.number(), status: z.enum(["todo", "in_progress", "review", "done"]) }))
    .mutation(async ({ input, ctx }) => {
      if (useTaskMock()) {
        const updated = mock.mockUpdateStatus(input.id, input.status, ctx.user);
        if (!updated) throw new Error("Task not found");
        return updated;
      }

      await ensureSchema();
      const oldTask = await findById<TaskDoc>(Collections.tasks, input.id);
      if (!oldTask) throw new Error("Task not found");

      const updated = await updateById<TaskDoc>(Collections.tasks, input.id, {
        status: input.status,
        updatedAt: new Date(),
      });
      if (!updated) throw new Error("Task not found");

      if (input.status !== oldTask.status) {
        await insertDoc<TaskActivityDoc>(Collections.taskActivity, {
          taskId: input.id,
          userId: ctx.user.id,
          action: "status_changed",
          oldValue: oldTask.status,
          newValue: input.status,
          metadata: null,
          createdAt: new Date(),
        });
        await notifyTaskMembers({
          taskId: input.id,
          actor: ctx.user,
          type: "task_updated",
          title: "Task status changed",
          message: `${actorLabel(ctx.user)} changed "${oldTask.title}" to ${input.status.replace(/_/g, " ")}`,
        });
      }

      return updated;
    }),

  addParticipant: authedQuery
    .input(z.object({ taskId: z.number(), userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (useTaskMock()) return mock.mockAddParticipant(input.taskId, input.userId, ctx.user);

      await ensureSchema();
      const participantCol = await getCollection<TaskParticipantDoc>(Collections.taskParticipants);
      const existing = await participantCol.findOne({
        taskId: input.taskId,
        userId: input.userId,
        role: "participant",
      });
      if (!existing) {
        await insertDoc<TaskParticipantDoc>(Collections.taskParticipants, {
          taskId: input.taskId,
          userId: input.userId,
          role: "participant",
          createdAt: new Date(),
        });
      }

      await insertDoc<TaskActivityDoc>(Collections.taskActivity, {
        taskId: input.taskId,
        userId: ctx.user.id,
        action: "participant_added",
        oldValue: null,
        newValue: String(input.userId),
        metadata: null,
        createdAt: new Date(),
      });

      const task = await findById<TaskDoc>(Collections.tasks, input.taskId);
      const addedUser = await findById<UserDoc>(Collections.users, input.userId);
      await notifyTaskMembers({
        taskId: input.taskId,
        actor: ctx.user,
        type: "task_updated",
        title: "Added as participant",
        message: `${actorLabel(ctx.user)} added ${addedUser?.name ?? addedUser?.email ?? "someone"} as a participant on "${task?.title ?? "a task"}"`,
        extraRecipientIds: [input.userId],
      });

      return { success: true };
    }),

  removeParticipant: authedQuery
    .input(z.object({ taskId: z.number(), userId: z.number() }))
    .mutation(async ({ input }) => {
      if (useTaskMock()) return mock.mockRemoveParticipant(input.taskId, input.userId);

      await ensureSchema();
      const participantCol = await getCollection<TaskParticipantDoc>(Collections.taskParticipants);
      await participantCol.deleteOne({
        taskId: input.taskId,
        userId: input.userId,
        role: "participant",
      });
      return { success: true };
    }),

  addObserver: authedQuery
    .input(z.object({ taskId: z.number(), userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (useTaskMock()) return mock.mockAddObserver(input.taskId, input.userId, ctx.user);

      await ensureSchema();
      const task = await findById<TaskDoc>(Collections.tasks, input.taskId);
      if (!task) return { success: false };
      if (task.assigneeId === input.userId) return { success: false };

      const participantCol = await getCollection<TaskParticipantDoc>(Collections.taskParticipants);
      const existing = await participantCol.findOne({
        taskId: input.taskId,
        userId: input.userId,
        role: "observer",
      });
      if (!existing) {
        await insertDoc<TaskParticipantDoc>(Collections.taskParticipants, {
          taskId: input.taskId,
          userId: input.userId,
          role: "observer",
          createdAt: new Date(),
        });

        await insertDoc<TaskActivityDoc>(Collections.taskActivity, {
          taskId: input.taskId,
          userId: ctx.user.id,
          action: "observer_added",
          oldValue: null,
          newValue: String(input.userId),
          metadata: null,
          createdAt: new Date(),
        });

        const addedUser = await findById<UserDoc>(Collections.users, input.userId);
        await notifyTaskMembers({
          taskId: input.taskId,
          actor: ctx.user,
          type: "task_updated",
          title: "Added as observer",
          message: `${actorLabel(ctx.user)} added ${addedUser?.name ?? addedUser?.email ?? "someone"} as an observer on "${task.title}"`,
          extraRecipientIds: [input.userId],
        });
      }

      return { success: true };
    }),

  removeObserver: authedQuery
    .input(z.object({ taskId: z.number(), userId: z.number() }))
    .mutation(async ({ input }) => {
      if (useTaskMock()) return mock.mockRemoveObserver(input.taskId, input.userId);

      await ensureSchema();
      const participantCol = await getCollection<TaskParticipantDoc>(Collections.taskParticipants);
      await participantCol.deleteOne({
        taskId: input.taskId,
        userId: input.userId,
        role: "observer",
      });
      return { success: true };
    }),

  getActiveTimer: authedQuery
    .input(z.object({ taskId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (useTaskMock()) return mock.mockGetActiveTaskTimer(ctx.user.id, input.taskId);

      await ensureSchema();
      const timeCol = await getCollection<TimeEntryDoc>(Collections.timeEntries);
      const entry = await timeCol
        .find({
          userId: ctx.user.id,
          taskId: input.taskId,
          clockOut: null,
        })
        .sort({ clockIn: -1 })
        .limit(1)
        .next();

      return entry
        ? { taskId: input.taskId, startedAt: entry.clockIn, paused: false, accumulatedSeconds: 0 }
        : null;
    }),

  startTimer: authedQuery
    .input(z.object({ taskId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (useTaskMock()) return mock.mockStartTaskTimer(ctx.user.id, input.taskId, ctx.user);

      await ensureSchema();
      const now = new Date();
      const task = await findById<TaskDoc>(Collections.tasks, input.taskId);
      await insertDoc<TimeEntryDoc>(Collections.timeEntries, {
        userId: ctx.user.id,
        taskId: input.taskId,
        projectId: null,
        clockIn: now,
        clockOut: null,
        duration: null,
        durationSeconds: null,
        note: "Task timer",
        source: "web",
        createdAt: now,
        updatedAt: now,
      });

      await notifyTaskMembers({
        taskId: input.taskId,
        actor: ctx.user,
        type: "task_updated",
        title: "Timer started",
        message: `${actorLabel(ctx.user)} started the timer on "${task?.title ?? "a task"}"`,
      });

      return { taskId: input.taskId, startedAt: now };
    }),

  pauseTimer: authedQuery
    .input(z.object({ taskId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (useTaskMock()) return mock.mockPauseTaskTimer(ctx.user.id, input.taskId, ctx.user);

      await ensureSchema();
      const now = new Date();
      const timeCol = await getCollection<TimeEntryDoc>(Collections.timeEntries);
      const entry = await timeCol
        .find({
          userId: ctx.user.id,
          taskId: input.taskId,
          clockOut: null,
        })
        .sort({ clockIn: -1 })
        .limit(1)
        .next();

      if (!entry) throw new Error("No running timer for this task");

      const duration = Math.floor((now.getTime() - entry.clockIn.getTime()) / 60000);
      await updateById<TimeEntryDoc>(Collections.timeEntries, entry.id, {
        clockOut: now,
        duration,
        note: "Task timer (paused)",
        updatedAt: now,
      });

      await insertDoc<TaskActivityDoc>(Collections.taskActivity, {
        taskId: input.taskId,
        userId: ctx.user.id,
        action: "time_logged",
        oldValue: null,
        newValue: "paused timer",
        metadata: null,
        createdAt: now,
      });

      const task = await findById<TaskDoc>(Collections.tasks, input.taskId);
      await notifyTaskMembers({
        taskId: input.taskId,
        actor: ctx.user,
        type: "task_updated",
        title: "Timer paused",
        message: `${actorLabel(ctx.user)} paused the timer on "${task?.title ?? "a task"}"`,
      });

      return { accumulatedSeconds: duration * 60 };
    }),

  stopTimer: authedQuery
    .input(z.object({ taskId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (useTaskMock()) return mock.mockStopTaskTimer(ctx.user.id, input.taskId, ctx.user);

      await ensureSchema();
      const now = new Date();
      const timeCol = await getCollection<TimeEntryDoc>(Collections.timeEntries);
      const entry = await timeCol
        .find({
          userId: ctx.user.id,
          taskId: input.taskId,
          clockOut: null,
        })
        .sort({ clockIn: -1 })
        .limit(1)
        .next();

      if (!entry) throw new Error("No active timer for this task");

      const duration = Math.floor((now.getTime() - entry.clockIn.getTime()) / 60000);
      await updateById<TimeEntryDoc>(Collections.timeEntries, entry.id, {
        clockOut: now,
        duration,
        updatedAt: now,
      });

      await insertDoc<TaskActivityDoc>(Collections.taskActivity, {
        taskId: input.taskId,
        userId: ctx.user.id,
        action: "time_logged",
        oldValue: null,
        newValue: `${duration} minutes`,
        metadata: null,
        createdAt: now,
      });

      const task = await findById<TaskDoc>(Collections.tasks, input.taskId);
      await notifyTaskMembers({
        taskId: input.taskId,
        actor: ctx.user,
        type: "task_updated",
        title: "Timer stopped",
        message: `${actorLabel(ctx.user)} stopped the timer on "${task?.title ?? "a task"}" (${duration} min)`,
      });

      return { durationMinutes: duration };
    }),

  updateTimeEntry: authedQuery
    .input(z.object({
      taskId: z.number(),
      entryId: z.number(),
      clockIn: z.string(),
      clockOut: z.string(),
      reason: z.string().min(1, "A reason is required to edit time entries"),
    }))
    .mutation(async ({ ctx, input }) => {
      if (useTaskMock()) {
        return mock.mockUpdateTaskTimeEntry(ctx.user, input);
      }

      await ensureSchema();
      const task = await findById<TaskDoc>(Collections.tasks, input.taskId);
      if (!task) throw new Error("Task not found");

      const timeCol = await getCollection<TimeEntryDoc>(Collections.timeEntries);
      const entry = await timeCol.findOne({ id: input.entryId, taskId: input.taskId });
      if (!entry) throw new Error("Time entry not found");
      if (!entry.clockOut) throw new Error("Cannot edit an active timer session");
      if (!canEditTaskTimeEntry(ctx.user, task, entry)) {
        throw new Error("Not allowed to edit this time entry");
      }

      const clockIn = new Date(input.clockIn);
      const clockOut = new Date(input.clockOut);
      if (clockOut <= clockIn) throw new Error("End time must be after start time");

      const duration = Math.floor((clockOut.getTime() - clockIn.getTime()) / 60000);
      const now = new Date();
      const noteSuffix = `(edited: ${input.reason.trim()})`;
      const note = entry.note ? `${entry.note} ${noteSuffix}` : noteSuffix;

      const updated = await updateById<TimeEntryDoc>(Collections.timeEntries, input.entryId, {
        clockIn,
        clockOut,
        duration,
        note,
        source: entry.source === "manual" ? "manual" : entry.source,
        updatedAt: now,
      });

      await insertDoc<TaskActivityDoc>(Collections.taskActivity, {
        taskId: input.taskId,
        userId: ctx.user.id,
        action: "time_logged",
        oldValue: null,
        newValue: `Time entry edited — ${duration} min`,
        metadata: { entryId: input.entryId, reason: input.reason.trim() },
        createdAt: now,
      });

      await notifyTaskMembers({
        taskId: input.taskId,
        actor: ctx.user,
        type: "task_updated",
        title: "Time entry updated",
        message: `${actorLabel(ctx.user)} edited time logged on "${task.title}"`,
      });

      return updated;
    }),

  addManualTimeEntry: authedQuery
    .input(z.object({
      taskId: z.number(),
      userId: z.number().optional(),
      clockIn: z.string(),
      clockOut: z.string(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (useTaskMock()) {
        return mock.mockAddManualTaskTimeEntry(ctx.user, input);
      }

      await ensureSchema();
      const task = await findById<TaskDoc>(Collections.tasks, input.taskId);
      if (!task) throw new Error("Task not found");

      const targetUserId = input.userId ?? ctx.user.id;
      const isManager = ctx.user.role === "admin" || ctx.user.role === "manager";
      if (targetUserId !== ctx.user.id && !isManager && !canManageTaskTime(ctx.user, task)) {
        throw new Error("Not allowed to add time for this user");
      }
      if (!canManageTaskTime(ctx.user, task) && targetUserId !== ctx.user.id) {
        throw new Error("Not allowed to add time for this user");
      }

      const clockIn = new Date(input.clockIn);
      const clockOut = new Date(input.clockOut);
      if (clockOut <= clockIn) throw new Error("End time must be after start time");

      const durationSeconds = Math.max(
        0,
        Math.floor((clockOut.getTime() - clockIn.getTime()) / 1000),
      );
      const duration = Math.floor(durationSeconds / 60);
      const now = new Date();

      const entry = await insertDoc<TimeEntryDoc>(Collections.timeEntries, {
        userId: targetUserId,
        taskId: input.taskId,
        projectId: task.projectId ?? null,
        clockIn,
        clockOut,
        duration,
        durationSeconds,
        note: input.note?.trim() || "Manual entry",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      });

      await insertDoc<TaskActivityDoc>(Collections.taskActivity, {
        taskId: input.taskId,
        userId: ctx.user.id,
        action: "time_logged",
        oldValue: null,
        newValue: `Manual time added — ${duration} min`,
        metadata: { entryId: entry.id, targetUserId },
        createdAt: now,
      });

      await notifyTaskMembers({
        taskId: input.taskId,
        actor: ctx.user,
        type: "task_updated",
        title: "Time logged",
        message: `${actorLabel(ctx.user)} added ${duration} min of time on "${task.title}"`,
      });

      return entry;
    }),

  addComment: authedQuery
    .input(z.object({ taskId: z.number(), message: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      if (useTaskMock()) return mock.mockAddTaskComment(input.taskId, input.message, ctx.user);

      await ensureSchema();
      const preview =
        input.message.length > 120 ? `${input.message.slice(0, 120)}…` : input.message;

      await insertDoc<TaskActivityDoc>(Collections.taskActivity, {
        taskId: input.taskId,
        userId: ctx.user.id,
        action: "commented",
        oldValue: null,
        newValue: input.message,
        metadata: null,
        createdAt: new Date(),
      });

      await notifyTaskMembers({
        taskId: input.taskId,
        actor: ctx.user,
        type: "mention",
        title: "New comment on task",
        message: `${actorLabel(ctx.user)}: ${preview}`,
      });

      return { success: true };
    }),

  listAttachments: authedQuery
    .input(z.object({ taskId: z.number() }))
    .query(async ({ input }) => {
      if (useTaskMock()) return mock.mockListTaskAttachments(input.taskId);

      await ensureSchema();
      const attachmentCol = await getCollection<TaskAttachmentDoc>(Collections.taskAttachments);
      const attachments = await attachmentCol
        .find({ taskId: input.taskId })
        .sort({ createdAt: -1 })
        .toArray();
      return attachments.map(attachmentMeta);
    }),

  getAttachment: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      if (useTaskMock()) return mock.mockGetTaskAttachment(input.id);

      await ensureSchema();
      return findById<TaskAttachmentDoc>(Collections.taskAttachments, input.id);
    }),

  addAttachment: authedQuery
    .input(z.object({
      taskId: z.number(),
      fileName: z.string().min(1).max(500),
      mimeType: z.string().max(255).default("application/octet-stream"),
      fileSize: z.number().int().nonnegative(),
      dataBase64: z.string().min(1).max(50_000_000),
    }))
    .mutation(async ({ ctx, input }) => {
      if (useTaskMock()) {
        const { dataBase64, ...meta } = input;
        return mock.mockAddTaskAttachment({ ...meta, dataBase64 }, ctx.user);
      }

      await ensureSchema();
      const now = new Date();
      const attachment = await insertDoc<TaskAttachmentDoc>(Collections.taskAttachments, {
        taskId: input.taskId,
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        dataBase64: input.dataBase64,
        uploadedBy: ctx.user.id,
        createdAt: now,
      });
      return attachmentMeta(attachment);
    }),

  deleteAttachment: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      if (useTaskMock()) return mock.mockDeleteTaskAttachment(input.id);

      await ensureSchema();
      const attachmentCol = await getCollection<TaskAttachmentDoc>(Collections.taskAttachments);
      await attachmentCol.deleteOne({ id: input.id });
      return { success: true };
    }),

  bulkAction: authedQuery
    .input(
      z.object({
        taskIds: z.array(z.number()).min(1).max(100),
        action: z.enum(["delete", "status", "move_project"]),
        status: z.enum(["todo", "in_progress", "review", "done"]).optional(),
        projectId: z.number().nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (useTaskMock()) {
        return mock.mockBulkTaskAction(input, ctx.user);
      }

      await ensureSchema();
      const taskCol = await getCollection<TaskDoc>(Collections.tasks);
      const tasks = await taskCol.find({ id: { $in: input.taskIds } }).toArray();

      if (tasks.length === 0) {
        throw new Error("No tasks found");
      }

      for (const task of tasks) {
        if (task.projectId != null) {
          const project = await findById<ProjectDoc>(Collections.projects, task.projectId);
          const joined = project
            ? await isProjectMember(task.projectId, ctx.user.id, project.createdBy)
            : false;
          if (!canViewProjectTasks(ctx.user, project?.createdBy ?? null, joined)) {
            throw new Error("Not authorized to modify tasks in this project");
          }
        }

        const canEdit =
          ctx.user.role === "admin" ||
          ctx.user.role === "manager" ||
          hasPermission(ctx.user, "tasks.edit_all") ||
          (hasPermission(ctx.user, "tasks.edit_own") &&
            (task.createdBy === ctx.user.id || task.assigneeId === ctx.user.id));

        const canDelete =
          ctx.user.role === "admin" ||
          ctx.user.role === "manager" ||
          hasPermission(ctx.user, "tasks.delete") ||
          task.createdBy === ctx.user.id;

        if (input.action === "delete" && !canDelete) {
          throw new Error("Not authorized to delete one or more tasks");
        }
        if (input.action !== "delete" && !canEdit) {
          throw new Error("Not authorized to update one or more tasks");
        }
      }

      const now = new Date();

      if (input.action === "delete") {
        const ids = tasks.map((t) => t.id);
        const taskFilter = { taskId: { $in: ids } };
        await Promise.all([
          getCollection(Collections.taskParticipants).then((c) => c.deleteMany(taskFilter)),
          getCollection(Collections.subtasks).then((c) => c.deleteMany(taskFilter)),
          getCollection(Collections.taskActivity).then((c) => c.deleteMany(taskFilter)),
          getCollection(Collections.taskAttachments).then((c) => c.deleteMany(taskFilter)),
          getCollection(Collections.taskTagRelations).then((c) => c.deleteMany(taskFilter)),
          getCollection(Collections.timeEntries).then((c) => c.deleteMany(taskFilter)),
          getCollection(Collections.notifications).then((c) => c.deleteMany({ taskId: { $in: ids } })),
        ]);
        await taskCol.deleteMany({ id: { $in: ids } });
        return { success: true, affected: ids.length };
      }

      if (input.action === "status") {
        if (!input.status) throw new Error("Status is required");
        await taskCol.updateMany(
          { id: { $in: input.taskIds } },
          { $set: { status: input.status, updatedAt: now } },
        );
        return { success: true, affected: input.taskIds.length };
      }

      if (input.action === "move_project") {
        if (input.projectId != null) {
          const project = await findById<ProjectDoc>(Collections.projects, input.projectId);
          if (!project) throw new Error("Target project not found");
        }
        await taskCol.updateMany(
          { id: { $in: input.taskIds } },
          { $set: { projectId: input.projectId ?? null, updatedAt: now } },
        );
        return { success: true, affected: input.taskIds.length };
      }

      throw new Error("Unsupported action");
    }),
});
