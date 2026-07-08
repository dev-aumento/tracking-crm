import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { createContext } from "./context";
import { getLatestNotificationId, listNotificationsSince } from "./lib/notifications-feed";

const POLL_MS = 1_000;

export async function notificationStreamHandler(c: Context) {
  const ctx = await createContext({
    req: c.req.raw,
    resHeaders: c.res.headers,
  });

  if (!ctx.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userId = ctx.user.id;

  return streamSSE(c, async (stream) => {
    let lastId = await getLatestNotificationId(userId);
    let closed = false;

    const onAbort = () => {
      closed = true;
    };
    c.req.raw.signal.addEventListener("abort", onAbort);

    try {
      await stream.writeSSE({
        data: JSON.stringify({ type: "connected", lastId }),
      });

      while (!closed) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        if (closed) break;

        const incoming = await listNotificationsSince(userId, lastId);
        if (incoming.length > 0) {
          lastId = Math.max(lastId, ...incoming.map((n) => n.id));
          await stream.writeSSE({
            data: JSON.stringify({
              type: "notifications",
              notifications: incoming,
            }),
          });
        } else {
          await stream.writeSSE({ data: JSON.stringify({ type: "ping" }) });
        }
      }
    } finally {
      c.req.raw.signal.removeEventListener("abort", onAbort);
    }
  });
}
