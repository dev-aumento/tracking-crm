import { z } from "zod";
import { createRouter, authedQuery, managerQuery, adminQuery } from "./middleware";
import { isAuthDisabled } from "./lib/dev-mode";
import * as mock from "./lib/mock-store";
import { buildTimeStatsSummary, localDateKey, computeSessionWorkSeconds, periodClockInBounds, dayBounds, roundHours, attendanceEntrySeconds } from "@/lib/work-hours-policy";
import {
  getCollection,
  insertDoc,
  updateById,
  countDocs,
  hasMongoConfigured,
} from "./queries/connection";
import { Collections } from "@db/mongo/collections";
import type { TimeEntryDoc, UserDoc, WorkSessionDoc, WorkBreakDoc, TimeApprovalRequestDoc } from "@db/mongo/types";
import { ensureSchema } from "./lib/migrate";
import { closeOpenBreaksForSession, closeOpenWorkBreak, openWorkBreak } from "./lib/work-breaks";
import { notifyAdmins } from "./lib/notify-admins";
import {
  applyBreakApproval,
  applyClockInApproval,
  findPendingClockInRequest,
  findClockInRequestForSession,
  notifyUserOfTimeReview,
  validateManualClockInRequest,
} from "./lib/time-approvals";

type SessionPauseFields = Pick<
  WorkSessionDoc,
  "paused" | "accumulatedWorkSeconds" | "breakStartedAt" | "workSegmentStartedAt"
>;

function sessionTiming(state: SessionPauseFields) {
  const workElapsedSeconds = computeSessionWorkSeconds(state);
  const breakElapsedSeconds = state.breakStartedAt
    ? Math.floor((Date.now() - state.breakStartedAt.getTime()) / 1000)
    : 0;
  return { workElapsedSeconds, breakElapsedSeconds };
}

function enrichSession(session: WorkSessionDoc) {
  const hasPauseState =
    session.workSegmentStartedAt != null ||
    session.paused ||
    session.accumulatedWorkSeconds > 0 ||
    session.breakStartedAt != null;

  if (!hasPauseState) {
    const elapsed = Math.floor((Date.now() - session.startTime.getTime()) / 1000);
    return {
      ...session,
      paused: false,
      workElapsedSeconds: elapsed,
      breakElapsedSeconds: 0,
    };
  }

  const { workElapsedSeconds, breakElapsedSeconds } = sessionTiming(session);
  return {
    ...session,
    paused: session.paused,
    workElapsedSeconds,
    breakElapsedSeconds,
  };
}

async function attachSessionApprovalInfo<T extends WorkSessionDoc>(
  session: T & { workElapsedSeconds: number; breakElapsedSeconds: number },
) {
  const existing = await findClockInRequestForSession(session.id);
  return {
    ...session,
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

async function findActiveSession(userId: number) {
  const sessionCol = await getCollection<WorkSessionDoc>(Collections.workSessions);
  return sessionCol.findOne({ userId, active: true });
}

async function endActiveSessions(userId: number, endTime: Date) {
  const sessionCol = await getCollection<WorkSessionDoc>(Collections.workSessions);
  await sessionCol.updateMany(
    { userId, active: true },
    { $set: { active: false, endTime } },
  );
}

function entryLiveSeconds(entry: TimeEntryDoc, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - entry.clockIn.getTime()) / 1000));
}

async function attendanceLiveSeconds(
  userId: number,
  dateStr: string,
  entries: TimeEntryDoc[],
  now: Date,
) {
  const session = await findActiveSession(userId);
  if (session && localDateKey(session.startTime) === dateStr) {
    return computeSessionWorkSeconds(
      { ...session, startTime: session.startTime },
      now,
    );
  }

  const openAttendance = entries.find((e) => !e.clockOut && e.taskId == null);
  if (openAttendance) {
    return entryLiveSeconds(openAttendance, now);
  }

  return 0;
}

async function completedAttendanceSecondsForDay(
  userId: number,
  dateStr: string,
  now = new Date(),
) {
  const { start, end } = dayBounds(dateStr);
  const timeCol = await getCollection<TimeEntryDoc>(Collections.timeEntries);
  const entries = await timeCol
    .find({
      userId,
      taskId: null,
      clockIn: { $gte: start, $lte: end },
      clockOut: { $ne: null },
    })
    .toArray();

  return entries.reduce((sum, entry) => sum + attendanceEntrySeconds(entry), 0);
}

function sumAttendanceDaySeconds(
  entries: TimeEntryDoc[],
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
  entry: TimeEntryDoc,
  attendanceLiveSeconds: number,
) {
  if (entry.clockOut) return attendanceEntrySeconds(entry);
  if (!entry.clockOut && attendanceLiveSeconds > 0) {
    return attendanceLiveSeconds;
  }
  return null;
}

async function buildDayHoursForUser(userId: number, dateStr: string, now = new Date()) {
  const { start, end } = dayBounds(dateStr);
  const timeCol = await getCollection<TimeEntryDoc>(Collections.timeEntries);
  const entries = await timeCol
    .find({
      userId,
      taskId: null,
      clockIn: { $gte: start, $lte: end },
    })
    .sort({ clockIn: 1 })
    .toArray();

  const attendanceLive = await attendanceLiveSeconds(userId, dateStr, entries, now);
  const totalSeconds = sumAttendanceDaySeconds(entries, attendanceLive);

  const enrichedEntries = entries.map((entry) => ({
    id: entry.id,
    clockIn: entry.clockIn,
    clockOut: entry.clockOut,
    durationSeconds: displayAttendanceDurationSeconds(entry, attendanceLive),
    duration: displayAttendanceDurationSeconds(entry, attendanceLive) != null
      ? Math.floor((displayAttendanceDurationSeconds(entry, attendanceLive) ?? 0) / 60)
      : null,
    note: entry.note,
  }));

  return {
    entries: enrichedEntries,
    totalMinutes: totalSeconds / 60,
    totalSeconds,
    totalHours: roundHours(totalSeconds / 3600),
    entriesCount: entries.length,
  };
}

export const timeEntryRouter = createRouter({
  clockIn: authedQuery
    .input(z.object({ note: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      if (isAuthDisabled() || !hasMongoConfigured()) {
        return mock.mockClockIn(ctx.user.id, input?.note);
      }

      await ensureSchema();
      const now = new Date();

      await endActiveSessions(ctx.user.id, now);

      const session = await insertDoc<WorkSessionDoc>(Collections.workSessions, {
        userId: ctx.user.id,
        startTime: now,
        endTime: null,
        active: true,
        paused: false,
        accumulatedWorkSeconds: 0,
        workSegmentStartedAt: now,
        breakStartedAt: null,
        createdAt: now,
      });

      const entry = await insertDoc<TimeEntryDoc>(Collections.timeEntries, {
        userId: ctx.user.id,
        taskId: null,
        projectId: null,
        clockIn: now,
        clockOut: null,
        duration: null,
        durationSeconds: null,
        note: input?.note || "Clocked in",
        source: "web",
        createdAt: now,
        updatedAt: now,
      });

      return { entry, session: enrichSession(session) };
    }),

  clockOut: authedQuery
    .input(z.object({ note: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      if (isAuthDisabled() || !hasMongoConfigured()) {
        return mock.mockClockOut(ctx.user.id, input?.note);
      }

      await ensureSchema();
      const now = new Date();
      const session = await findActiveSession(ctx.user.id);

      const timeCol = await getCollection<TimeEntryDoc>(Collections.timeEntries);
      const entry = await timeCol.findOne(
        { userId: ctx.user.id, clockOut: null, taskId: null },
        { sort: { clockIn: -1 } },
      );

      let durationSeconds = 0;

      if (session) {
        if (session.paused) {
          await closeOpenBreaksForSession(session.id, now);
        }
        durationSeconds = Math.max(
          0,
          computeSessionWorkSeconds({
            ...session,
            startTime: session.startTime,
          }),
        );
        await updateById<WorkSessionDoc>(Collections.workSessions, session.id, {
          active: false,
          endTime: now,
          paused: false,
          accumulatedWorkSeconds: 0,
          workSegmentStartedAt: null,
          breakStartedAt: null,
        });
      } else if (entry) {
        durationSeconds = Math.max(
          0,
          Math.floor((now.getTime() - entry.clockIn.getTime()) / 1000),
        );
      }

      if (entry) {
        const note = input?.note
          ? `${entry.note || ""} - ${input.note}`
          : entry.note;

        await updateById<TimeEntryDoc>(Collections.timeEntries, entry.id, {
          clockOut: now,
          durationSeconds,
          duration: Math.floor(durationSeconds / 60),
          note,
          updatedAt: now,
        });
      }

      return {
        durationSeconds,
        duration: Math.floor(durationSeconds / 60),
        entry: entry
          ? { ...entry, clockOut: now, durationSeconds, duration: Math.floor(durationSeconds / 60) }
          : null,
      };
    }),

  getCurrentSession: authedQuery
    .query(async ({ ctx }) => {
      if (isAuthDisabled() || !hasMongoConfigured()) {
        return mock.mockCurrentSession(ctx.user.id);
      }

      await ensureSchema();
      const session = await findActiveSession(ctx.user.id);
      if (!session) return null;
      const enriched = enrichSession(session);
      const priorDayWorkSeconds = await completedAttendanceSecondsForDay(
        ctx.user.id,
        localDateKey(session.startTime),
      );
      return attachSessionApprovalInfo({ ...enriched, priorDayWorkSeconds });
    }),

  pauseSession: authedQuery
    .mutation(async ({ ctx }) => {
      if (isAuthDisabled() || !hasMongoConfigured()) {
        return mock.mockPauseWorkSession(ctx.user.id);
      }

      await ensureSchema();
      const session = await findActiveSession(ctx.user.id);
      if (!session) throw new Error("No active work session to pause");

      let workSegmentStartedAt = session.workSegmentStartedAt ?? session.startTime;
      if (session.paused || !workSegmentStartedAt) {
        throw new Error("No active work session to pause");
      }

      const accumulatedWorkSeconds =
        session.accumulatedWorkSeconds +
        Math.floor((Date.now() - workSegmentStartedAt.getTime()) / 1000);

      const breakStart = new Date();
      const timeCol = await getCollection<TimeEntryDoc>(Collections.timeEntries);
      const entry = await timeCol.findOne(
        { userId: ctx.user.id, clockOut: null, taskId: null },
        { sort: { clockIn: -1 } },
      );

      await openWorkBreak(
        ctx.user.id,
        session.id,
        entry?.id ?? null,
        breakStart,
      );

      const updated = await updateById<WorkSessionDoc>(Collections.workSessions, session.id, {
        accumulatedWorkSeconds,
        workSegmentStartedAt: null,
        breakStartedAt: breakStart,
        paused: true,
      });

      return enrichSession(updated!);
    }),

  resumeSession: authedQuery
    .mutation(async ({ ctx }) => {
      if (isAuthDisabled() || !hasMongoConfigured()) {
        return mock.mockResumeWorkSession(ctx.user.id);
      }

      await ensureSchema();
      const session = await findActiveSession(ctx.user.id);
      if (!session) throw new Error("No active work session");
      if (!session.paused) throw new Error("Work session is not paused");

      const resumeTime = new Date();
      await closeOpenWorkBreak(session.id, resumeTime);

      const updated = await updateById<WorkSessionDoc>(Collections.workSessions, session.id, {
        workSegmentStartedAt: resumeTime,
        breakStartedAt: null,
        paused: false,
      });

      return enrichSession(updated!);
    }),

  list: authedQuery
    .input(
      z.object({
        userId: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { userId, startDate, endDate, page = 1, limit = 50 } = input || {};
      const canViewOthers = ctx.user.role === "admin";
      const targetUserId = canViewOthers && userId ? userId : ctx.user.id;
      if (isAuthDisabled() || !hasMongoConfigured()) {
        return mock.mockTimeEntryList(targetUserId, { limit });
      }

      await ensureSchema();
      const skip = (page - 1) * limit;
      const filter: Record<string, unknown> = { userId: targetUserId };

      if (startDate || endDate) {
        const clockIn: Record<string, Date> = {};
        if (startDate && endDate && startDate === endDate) {
          const { start, end } = dayBounds(startDate);
          clockIn.$gte = start;
          clockIn.$lte = end;
        } else {
          if (startDate) clockIn.$gte = new Date(startDate);
          if (endDate) clockIn.$lte = new Date(endDate);
        }
        filter.clockIn = clockIn;
      }

      const timeCol = await getCollection<TimeEntryDoc>(Collections.timeEntries);
      const [entries, total] = await Promise.all([
        timeCol.find(filter).sort({ clockIn: -1 }).skip(skip).limit(limit).toArray(),
        countDocs(Collections.timeEntries, filter),
      ]);

      return { entries, total };
    }),

  getDayHours: authedQuery
    .input(
      z.object({
        date: z.string(),
        userId: z.number().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const canViewOthers = ctx.user.role === "admin";
      const targetUserId = canViewOthers && input.userId ? input.userId : ctx.user.id;

      if (isAuthDisabled() || !hasMongoConfigured()) {
        return mock.mockGetDayHours(targetUserId, input.date);
      }

      await ensureSchema();
      return buildDayHoursForUser(targetUserId, input.date);
    }),

  getBreaks: authedQuery
    .input(
      z.object({
        date: z.string(),
        userId: z.number().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const canViewOthers = ctx.user.role === "admin";
      const targetUserId = canViewOthers && input.userId ? input.userId : ctx.user.id;

      if (isAuthDisabled() || !hasMongoConfigured()) {
        return mock.mockGetBreaks(targetUserId, input.date);
      }

      await ensureSchema();
      const { start, end } = dayBounds(input.date);
      const breakCol = await getCollection<WorkBreakDoc>(Collections.workBreaks);
      const breaks = await breakCol
        .find({
          userId: targetUserId,
          startTime: { $gte: start, $lte: end },
        })
        .sort({ startTime: 1 })
        .toArray();

      const approvalCol = await getCollection<TimeApprovalRequestDoc>(
        Collections.timeApprovalRequests,
      );
      const pendingBreakEdits = await approvalCol
        .find({
          userId: targetUserId,
          type: "break",
          status: "pending",
          workBreakId: { $in: breaks.map((b) => b.id) },
        })
        .toArray();
      const pendingByBreakId = new Map(
        pendingBreakEdits.map((r) => [r.workBreakId!, r]),
      );

      return {
        breaks: breaks.map((b) => ({
          ...b,
          pendingEdit: pendingByBreakId.has(b.id)
            ? {
                id: pendingByBreakId.get(b.id)!.id,
                requestedBreakStart: pendingByBreakId.get(b.id)!.requestedBreakStart!,
                requestedBreakEnd: pendingByBreakId.get(b.id)!.requestedBreakEnd,
                reason: pendingByBreakId.get(b.id)!.reason,
              }
            : null,
        })),
      };
    }),

  updateBreak: authedQuery
    .input(
      z.object({
        id: z.number(),
        startTime: z.string(),
        endTime: z.string().optional().nullable(),
        reason: z.string().min(1, "A reason is required to edit break times"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (isAuthDisabled() || !hasMongoConfigured()) {
        return mock.mockRequestBreakEdit(ctx.user, input);
      }

      await ensureSchema();
      const breakCol = await getCollection<WorkBreakDoc>(Collections.workBreaks);
      const existing = await breakCol.findOne({ id: input.id });
      if (!existing) throw new Error("Break not found");
      if (existing.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new Error("Not allowed to edit this break");
      }

      const startTime = new Date(input.startTime);
      const endTime = input.endTime ? new Date(input.endTime) : null;
      if (endTime && endTime <= startTime) {
        throw new Error("Break end must be after break start");
      }

      if (ctx.user.role === "admin") {
        const now = new Date();
        const updated = await updateById<WorkBreakDoc>(Collections.workBreaks, input.id, {
          startTime,
          endTime,
          reason: input.reason.trim(),
          manuallyEdited: true,
          updatedAt: now,
        });
        return { ...updated!, requiresApproval: false };
      }

      const approvalCol = await getCollection<TimeApprovalRequestDoc>(
        Collections.timeApprovalRequests,
      );
      const existingPending = await approvalCol.findOne({
        workBreakId: input.id,
        type: "break",
        status: "pending",
      });
      if (existingPending) {
        throw new Error("A break edit request is already pending approval");
      }

      const now = new Date();
      const request = await insertDoc<TimeApprovalRequestDoc>(
        Collections.timeApprovalRequests,
        {
          userId: ctx.user.id,
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
        },
      );

      const actorName = ctx.user.name || ctx.user.email || "An employee";
      await notifyAdmins({
        actor: ctx.user,
        type: "time_approval_pending",
        title: "Break edit needs approval",
        message: `${actorName} requested a break time change: ${input.reason.trim()}`,
        approvalRequestId: request.id,
      });

      return { ...request, requiresApproval: true };
    }),

  requestManualClockIn: authedQuery
    .input(
      z.object({
        requestedClockIn: z.string(),
        reason: z.string().min(1, "A reason is required for manual clock-in"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (isAuthDisabled() || !hasMongoConfigured()) {
        return mock.mockRequestManualClockIn(ctx.user, input);
      }

      await ensureSchema();
      const session = await findActiveSession(ctx.user.id);
      if (!session) throw new Error("You must be clocked in to request a manual clock-in time");

      const timeCol = await getCollection<TimeEntryDoc>(Collections.timeEntries);
      const entry = await timeCol.findOne(
        { userId: ctx.user.id, clockOut: null, taskId: null },
        { sort: { clockIn: -1 } },
      );
      const actualClockIn = entry?.clockIn ?? session.startTime;
      const requestedClockIn = new Date(input.requestedClockIn);
      validateManualClockInRequest(requestedClockIn, actualClockIn);

      const existingRequest = await findClockInRequestForSession(session.id);
      if (existingRequest) {
        throw new Error("You have already submitted a manual clock-in request for this session");
      }

      const now = new Date();
      const request = await insertDoc<TimeApprovalRequestDoc>(
        Collections.timeApprovalRequests,
        {
          userId: ctx.user.id,
          type: "clock_in",
          status: "pending",
          reason: input.reason.trim(),
          workSessionId: session.id,
          timeEntryId: entry?.id ?? null,
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
        },
      );

      const actorName = ctx.user.name || ctx.user.email || "An employee";
      const requestedLabel = requestedClockIn.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
      const actualLabel = actualClockIn.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });

      await notifyAdmins({
        actor: ctx.user,
        type: "time_approval_pending",
        title: "Manual clock-in needs approval",
        message: `${actorName} requests clock-in at ${requestedLabel} instead of ${actualLabel}: ${input.reason.trim()}`,
        approvalRequestId: request.id,
      });

      return { ...request, requiresApproval: true };
    }),

  listPendingApprovals: adminQuery.query(async () => {
    if (isAuthDisabled() || !hasMongoConfigured()) {
      return mock.mockListPendingApprovals();
    }

    await ensureSchema();
    const approvalCol = await getCollection<TimeApprovalRequestDoc>(
      Collections.timeApprovalRequests,
    );
    const userCol = await getCollection<UserDoc>(Collections.users);
    const requests = await approvalCol
      .find({ status: "pending" })
      .sort({ createdAt: -1 })
      .toArray();

    const userIds = [...new Set(requests.map((r) => r.userId))];
    const users = userIds.length
      ? await userCol.find({ id: { $in: userIds } }).toArray()
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      requests: requests.map((r) => ({
        ...r,
        user: userMap.get(r.userId) ?? null,
      })),
    };
  }),

  reviewTimeApproval: adminQuery
    .input(
      z.object({
        id: z.number(),
        action: z.enum(["approve", "reject"]),
        reviewNote: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (isAuthDisabled() || !hasMongoConfigured()) {
        return mock.mockReviewTimeApproval(ctx.user, input);
      }

      await ensureSchema();
      const approvalCol = await getCollection<TimeApprovalRequestDoc>(
        Collections.timeApprovalRequests,
      );
      const request = await approvalCol.findOne({ id: input.id });
      if (!request) throw new Error("Approval request not found");
      if (request.status !== "pending") {
        throw new Error("This request has already been reviewed");
      }

      const now = new Date();
      const approved = input.action === "approve";
      const userCol = await getCollection<UserDoc>(Collections.users);
      const employee = await userCol.findOne({ id: request.userId });

      if (approved) {
        if (request.type === "clock_in") {
          const sessionCol = await getCollection<WorkSessionDoc>(Collections.workSessions);
          const session = request.workSessionId
            ? await sessionCol.findOne({ id: request.workSessionId })
            : null;
          if (!session) throw new Error("Work session not found");

          const timeCol = await getCollection<TimeEntryDoc>(Collections.timeEntries);
          const entry = request.timeEntryId
            ? await timeCol.findOne({ id: request.timeEntryId })
            : null;

          await applyClockInApproval(request, session, entry);
        } else if (request.type === "break") {
          const breakCol = await getCollection<WorkBreakDoc>(Collections.workBreaks);
          const breakItem = request.workBreakId
            ? await breakCol.findOne({ id: request.workBreakId })
            : null;
          if (!breakItem) throw new Error("Break not found");
          await applyBreakApproval(request, breakItem);
        }
      }

      await updateById<TimeApprovalRequestDoc>(Collections.timeApprovalRequests, request.id, {
        status: approved ? "approved" : "rejected",
        reviewedBy: ctx.user.id,
        reviewedAt: now,
        reviewNote: input.reviewNote?.trim() || null,
        updatedAt: now,
      });

      const employeeName = employee?.name || "Employee";
      const reviewMessage = approved
        ? `Your ${request.type === "clock_in" ? "manual clock-in" : "break edit"} request was approved.`
        : `Your ${request.type === "clock_in" ? "manual clock-in" : "break edit"} request was rejected.${input.reviewNote ? ` Note: ${input.reviewNote.trim()}` : ""}`;

      await notifyUserOfTimeReview(request.userId, ctx.user, approved, reviewMessage);

      return { success: true, approved, employeeName };
    }),

  getStats: authedQuery
    .input(z.object({ period: z.enum(["today", "week", "month"]).default("week") }))
    .query(async ({ ctx, input }) => {
      if (isAuthDisabled() || !hasMongoConfigured()) {
        return mock.mockTimeStats(ctx.user.id, input.period);
      }

      await ensureSchema();
      const now = new Date();
      const { start: startDate, end: endDate } = periodClockInBounds(input.period, now);

      const timeCol = await getCollection<TimeEntryDoc>(Collections.timeEntries);
      const entries = await timeCol
        .find({
          userId: ctx.user.id,
          taskId: null,
          clockIn: { $gte: startDate, $lte: endDate },
          clockOut: { $ne: null },
        })
        .toArray();

      const dailyMapSeconds = new Map<string, number>();
      entries.forEach((e) => {
        const date = localDateKey(e.clockIn);
        dailyMapSeconds.set(
          date,
          (dailyMapSeconds.get(date) || 0) + attendanceEntrySeconds(e),
        );
      });

      const session = await findActiveSession(ctx.user.id);
      let activeSession: { date: string; workSeconds: number } | null = null;

      if (session) {
        const sessionDate = localDateKey(session.startTime);
        const sessionInPeriod =
          session.startTime >= startDate && session.startTime <= endDate;

        if (sessionInPeriod) {
          const workSeconds = computeSessionWorkSeconds({
            ...session,
            startTime: session.startTime,
          }, now);
          dailyMapSeconds.set(
            sessionDate,
            (dailyMapSeconds.get(sessionDate) || 0) + workSeconds,
          );
          activeSession = { date: sessionDate, workSeconds };
        }
      }

      const totalSeconds = Array.from(dailyMapSeconds.values()).reduce(
        (sum, seconds) => sum + seconds,
        0,
      );
      const dailyMapMinutes = new Map(
        Array.from(dailyMapSeconds.entries()).map(([date, seconds]) => [
          date,
          seconds / 60,
        ]),
      );

      const summary = buildTimeStatsSummary(totalSeconds / 60, dailyMapMinutes, input.period);

      return {
        ...summary,
        totalSeconds,
        entriesCount: entries.length,
        activeSession,
      };
    }),

  getTeamHours: adminQuery
    .input(z.object({
      date: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      if (isAuthDisabled() || !hasMongoConfigured()) {
        return mock.mockTeamHours(input ?? undefined);
      }

      await ensureSchema();

      let dateStr: string;
      if (input?.date) {
        dateStr = input.date;
      } else {
        dateStr = localDateKey(new Date());
      }

      const userCol = await getCollection<UserDoc>(Collections.users);
      const allUsers = await userCol
        .find({ status: "active" })
        .project({ id: 1, name: 1, avatar: 1, role: 1 })
        .toArray();

      const now = new Date();
      const teamHours = await Promise.all(
        allUsers.map(async (user) => {
          const day = await buildDayHoursForUser(user.id, dateStr, now);
          return {
            userId: user.id,
            name: user.name || "Unknown",
            avatar: user.avatar,
            role: user.role,
            totalHours: day.totalHours,
            entriesCount: day.entriesCount,
          };
        }),
      );

      return teamHours;
    }),

  createManual: managerQuery
    .input(z.object({
      userId: z.number(),
      clockIn: z.string(),
      clockOut: z.string(),
      note: z.string().optional(),
      taskId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      await ensureSchema();
      const clockIn = new Date(input.clockIn);
      const clockOut = new Date(input.clockOut);
      const durationSeconds = Math.max(
        0,
        Math.floor((clockOut.getTime() - clockIn.getTime()) / 1000),
      );
      const duration = Math.floor(durationSeconds / 60);
      const now = new Date();

      return insertDoc<TimeEntryDoc>(Collections.timeEntries, {
        userId: input.userId,
        taskId: input.taskId ?? null,
        projectId: null,
        clockIn,
        clockOut,
        duration,
        durationSeconds,
        note: input.note || "Manual entry",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      });
    }),

  delete: managerQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await ensureSchema();
      const timeCol = await getCollection<TimeEntryDoc>(Collections.timeEntries);
      await timeCol.deleteOne({ id: input.id });
      return { success: true };
    }),
});
