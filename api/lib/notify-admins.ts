import { Collections } from "@db/mongo/collections";
import type { NotificationDoc, SafeUser, UserDoc } from "@db/mongo/types";
import { getCollection, insertDoc } from "../queries/connection";

type NotifyAdminsInput = {
  actor: SafeUser;
  type: NotificationDoc["type"];
  title: string;
  message: string;
  approvalRequestId?: number | null;
  excludeUserIds?: number[];
};

export async function notifyAdmins({
  actor,
  type,
  title,
  message,
  approvalRequestId = null,
  excludeUserIds = [],
}: NotifyAdminsInput) {
  const excluded = new Set([actor.id, ...excludeUserIds]);
  const usersCol = await getCollection<UserDoc>(Collections.users);
  const admins = await usersCol
    .find({ role: "admin", status: "active" })
    .toArray();

  const recipients = admins.filter((admin) => !excluded.has(admin.id));
  if (recipients.length === 0) return;

  const now = new Date();
  await Promise.all(
    recipients.map((admin) =>
      insertDoc<NotificationDoc>(Collections.notifications, {
        userId: admin.id,
        actorId: actor.id,
        type,
        title,
        message,
        taskId: null,
        approvalRequestId,
        read: false,
        createdAt: now,
      }),
    ),
  );
}
