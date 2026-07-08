import { Collections } from "@db/mongo/collections";
import type {
  NotificationDoc,
  SafeUser,
  TimeApprovalRequestDoc,
  TimeEntryDoc,
  WorkBreakDoc,
  WorkSessionDoc,
} from "@db/mongo/types";
import { getCollection, insertDoc, updateById } from "../queries/connection";
import { localDateKey } from "@/lib/work-hours-policy";

export async function findClockInRequestForSession(workSessionId: number) {
  const col = await getCollection<TimeApprovalRequestDoc>(Collections.timeApprovalRequests);
  return col.findOne({
    workSessionId,
    type: "clock_in",
  });
}

/** @deprecated Use findClockInRequestForSession — kept for callers that only need pending. */
export async function findPendingClockInRequest(workSessionId: number) {
  const col = await getCollection<TimeApprovalRequestDoc>(Collections.timeApprovalRequests);
  return col.findOne({
    workSessionId,
    type: "clock_in",
    status: "pending",
  });
}

export async function applyClockInApproval(
  request: TimeApprovalRequestDoc,
  session: WorkSessionDoc,
  entry: TimeEntryDoc | null,
) {
  if (!request.requestedClockIn || !request.originalClockIn) {
    throw new Error("Invalid clock-in approval request");
  }

  const deltaSeconds = Math.floor(
    (request.originalClockIn.getTime() - request.requestedClockIn.getTime()) / 1000,
  );
  if (deltaSeconds <= 0) {
    throw new Error("Approved clock-in must be earlier than the actual clock-in");
  }

  const now = new Date();
  await updateById<WorkSessionDoc>(Collections.workSessions, session.id, {
    startTime: request.requestedClockIn,
    accumulatedWorkSeconds: session.accumulatedWorkSeconds + deltaSeconds,
  });

  if (entry) {
    await updateById<TimeEntryDoc>(Collections.timeEntries, entry.id, {
      clockIn: request.requestedClockIn,
      note: entry.note
        ? `${entry.note} (clock-in adjusted to ${request.requestedClockIn.toLocaleString()})`
        : `Clock-in adjusted to ${request.requestedClockIn.toLocaleString()}`,
      updatedAt: now,
    });
  }
}

export async function applyBreakApproval(
  request: TimeApprovalRequestDoc,
  breakItem: WorkBreakDoc,
) {
  if (!request.requestedBreakStart) {
    throw new Error("Invalid break approval request");
  }

  const startTime = request.requestedBreakStart;
  const endTime = request.requestedBreakEnd;
  if (endTime && endTime <= startTime) {
    throw new Error("Break end must be after break start");
  }

  const now = new Date();
  await updateById<WorkBreakDoc>(Collections.workBreaks, breakItem.id, {
    startTime,
    endTime,
    reason: request.reason.trim(),
    manuallyEdited: true,
    updatedAt: now,
  });

  const sessionCol = await getCollection<WorkSessionDoc>(Collections.workSessions);
  const session = await sessionCol.findOne({
    id: breakItem.workSessionId,
    active: true,
  });

  if (session?.paused && session.breakStartedAt && !breakItem.endTime) {
    await updateById<WorkSessionDoc>(Collections.workSessions, session.id, {
      breakStartedAt: startTime,
    });
  }
}

export async function notifyUserOfTimeReview(
  userId: number,
  actor: SafeUser,
  approved: boolean,
  message: string,
) {
  const now = new Date();
  await insertDoc<NotificationDoc>(Collections.notifications, {
    userId,
    actorId: actor.id,
    type: approved ? "time_approved" : "time_rejected",
    title: approved ? "Time adjustment approved" : "Time adjustment rejected",
    message,
    taskId: null,
    read: false,
    createdAt: now,
  });
}

export function validateManualClockInRequest(
  requestedClockIn: Date,
  actualClockIn: Date,
) {
  if (requestedClockIn >= actualClockIn) {
    throw new Error("Manual clock-in time must be earlier than your actual clock-in time");
  }
  if (localDateKey(requestedClockIn) !== localDateKey(actualClockIn)) {
    throw new Error("Manual clock-in must be on the same day as your session");
  }
  if (requestedClockIn.getTime() > Date.now()) {
    throw new Error("Manual clock-in cannot be in the future");
  }
}
