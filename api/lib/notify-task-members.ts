import { Collections } from "@db/mongo/collections";
import type { NotificationDoc, SafeUser, TaskDoc } from "@db/mongo/types";
import { findById, getCollection, insertDoc } from "../queries/connection";

type NotifyTaskMembersInput = {
  taskId: number;
  actor: SafeUser;
  type: NotificationDoc["type"];
  title: string;
  message: string;
  /** Additional recipients beyond assignee + participants (e.g. newly added member). */
  extraRecipientIds?: number[];
  excludeUserIds?: number[];
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

export async function notifyTaskMembers({
  taskId,
  actor,
  type,
  title,
  message,
  extraRecipientIds = [],
  excludeUserIds = [],
}: NotifyTaskMembersInput) {
  const { assigneeId, participantIds } = await getTaskRecipientIds(taskId);
  const excluded = new Set([actor.id, ...excludeUserIds]);
  const recipientIds = new Set<number>();

  if (assigneeId != null) recipientIds.add(assigneeId);
  for (const id of participantIds) recipientIds.add(id);
  for (const id of extraRecipientIds) recipientIds.add(id);

  const recipients = [...recipientIds].filter((id) => !excluded.has(id));
  if (recipients.length === 0) return;

  const now = new Date();
  await Promise.all(
    recipients.map((userId) =>
      insertDoc<NotificationDoc>(Collections.notifications, {
        userId,
        actorId: actor.id,
        type,
        title,
        message,
        taskId,
        read: false,
        createdAt: now,
      }),
    ),
  );
}
