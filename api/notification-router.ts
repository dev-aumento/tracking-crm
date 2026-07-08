import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { isAuthDisabled } from "./lib/dev-mode";
import * as mock from "./lib/mock-store";
import {
  getCollection,
  updateById,
  countDocs,
  hasMongoConfigured,
} from "./queries/connection";
import { Collections } from "@db/mongo/collections";
import type { NotificationDoc } from "@db/mongo/types";
import { ensureSchema } from "./lib/migrate";

function useMock() {
  return isAuthDisabled() || !hasMongoConfigured();
}

export const notificationRouter = createRouter({
  list: authedQuery
    .input(
      z.object({
        unreadOnly: z.boolean().default(false),
        page: z.number().default(1),
        limit: z.number().default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { unreadOnly = false, page = 1, limit = 50 } = input || {};
      if (useMock()) return mock.mockNotificationList(ctx.user.id, unreadOnly);

      await ensureSchema();
      const offset = (page - 1) * limit;

      const filter: Record<string, unknown> = { userId: ctx.user.id };
      if (unreadOnly) filter.read = false;

      const col = await getCollection<NotificationDoc>(Collections.notifications);
      const [notifs, unreadCount] = await Promise.all([
        col.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).toArray(),
        countDocs(Collections.notifications, { userId: ctx.user.id, read: false }),
      ]);

      return {
        notifications: notifs,
        unreadCount,
      };
    }),

  markRead: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (useMock()) return mock.mockMarkNotificationRead(ctx.user.id, input.id);

      await ensureSchema();
      return updateById<NotificationDoc>(Collections.notifications, input.id, { read: true });
    }),

  markAllRead: authedQuery
    .mutation(async ({ ctx }) => {
      if (useMock()) return mock.mockMarkAllNotificationsRead(ctx.user.id);

      await ensureSchema();
      const col = await getCollection<NotificationDoc>(Collections.notifications);
      await col.updateMany(
        { userId: ctx.user.id, read: false },
        { $set: { read: true } },
      );
      return { success: true };
    }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (useMock()) return mock.mockDeleteNotification(ctx.user.id, input.id);

      await ensureSchema();
      const col = await getCollection<NotificationDoc>(Collections.notifications);
      await col.deleteOne({ id: input.id });
      return { success: true };
    }),
});
