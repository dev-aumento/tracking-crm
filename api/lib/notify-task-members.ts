import { Collections } from "@db/mongo/collections";
import type { NotificationDoc, SafeUser, TaskDoc, UserDoc } from "@db/mongo/types";
import { findById, getCollection, insertDoc } from "../queries/connection";
import { isHrDepartmentUser } from "@/lib/leave-policy";

type NotifyTaskMembersInput = {
  taskId: number;
  actor: SafeUser;
  type: NotificationDoc["type"];
  title: string;
  message: string;
  activityId?: number | null;
  /**
   * Extra recipients (e.g. newly added participant).
   * Participants are never notified by default — only the assignee falls
   * through unless includeAssignee is false.
   */
  extraRecipientIds?: number[];
  excludeUserIds?: number[];
  /** When false, skip the task assignee (e.g. participant-only alerts). Default true. */
  includeAssignee?: boolean;
};

export async function getTaskRecipientIds(taskId: number) {
  const task = await findById<TaskDoc>(Collections.tasks, taskId);
  if (!task) return { assigneeId: null as number | null, participantIds: [] as number[] };

  const participantCol = await getCollection<{ userId: number; role: string }>(
    Collections.taskParticipants,
  );
  const participants = await participantCol
    .find({ taskId, role: "participant" })
    .toArray();

  return {
    assigneeId: task.assigneeId,
    participantIds: participants.map((p) => p.userId),
  };
}

async function excludeHrRecipientIds(userIds: number[]): Promise<number[]> {
  if (userIds.length === 0) return [];
  const usersCol = await getCollection<UserDoc>(Collections.users);
  const users = await usersCol
    .find({ id: { $in: userIds } })
    .project({ id: 1, role: 1, department: 1 })
    .toArray();
  const allowed = new Set(
    users.filter((user) => !isHrDepartmentUser(user)).map((user) => user.id),
  );
  return userIds.filter((id) => allowed.has(id));
}

export async function notifyTaskMembers({
  taskId,
  actor,
  type,
  title,
  message,
  activityId = null,
  extraRecipientIds = [],
  excludeUserIds = [],
  includeAssignee = true,
}: NotifyTaskMembersInput) {
  const { assigneeId } = await getTaskRecipientIds(taskId);
  const excluded = new Set([actor.id, ...excludeUserIds]);
  const recipientIds = new Set<number>();

  if (includeAssignee && assigneeId != null) {
    recipientIds.add(assigneeId);
  }
  for (const id of extraRecipientIds) recipientIds.add(id);

  const candidates = [...recipientIds].filter((id) => !excluded.has(id));
  const recipients = await excludeHrRecipientIds(candidates);
  if (recipients.length === 0) return;

  const now = new Date();
  await Promise.all(
    recipients.map((userId) =>
      insertDoc<NotificationDoc>(Collections.notifications, {
        userId,
        organizationId: actor.organizationId,
        actorId: actor.id,
        type,
        title,
        message,
        taskId,
        activityId,
        read: false,
        createdAt: now,
      }),
    ),
  );
}
