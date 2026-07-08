export type StreamNotification = {
  id: number;
  title: string;
  message: string;
  read: boolean | null;
  createdAt: Date | string;
  type?: string;
  taskId?: number | null;
  projectId?: number | null;
  link?: string | null;
};

type StreamPayload =
  | { type: "connected"; lastId: number }
  | { type: "ping" }
  | { type: "notifications"; notifications: StreamNotification[] };

type InvalidateFn = () => void;

let eventSource: EventSource | null = null;
let subscriberCount = 0;
const listeners = new Set<(notifications: StreamNotification[]) => void>();
const invalidators = new Set<InvalidateFn>();

function runInvalidators() {
  for (const fn of invalidators) {
    fn();
  }
}

function handleMessage(event: MessageEvent<string>) {
  try {
    const payload = JSON.parse(event.data) as StreamPayload;
    if (payload.type !== "notifications" || payload.notifications.length === 0) {
      return;
    }

    runInvalidators();
    for (const listener of listeners) {
      listener(payload.notifications);
    }
  } catch {
    // Ignore malformed SSE payloads.
  }
}

function ensureEventSource() {
  if (eventSource) return;
  eventSource = new EventSource("/api/notifications/stream");
  eventSource.onmessage = handleMessage;
  eventSource.onerror = () => {
    // EventSource reconnects automatically.
  };
}

function closeEventSourceIfIdle() {
  if (subscriberCount === 0 && invalidators.size === 0 && eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

export function registerNotificationStreamInvalidator(fn: InvalidateFn) {
  invalidators.add(fn);
  ensureEventSource();

  return () => {
    invalidators.delete(fn);
    closeEventSourceIfIdle();
  };
}

export function subscribeNotificationStream(
  listener: (notifications: StreamNotification[]) => void,
) {
  subscriberCount += 1;
  listeners.add(listener);
  ensureEventSource();

  return () => {
    listeners.delete(listener);
    subscriberCount -= 1;
    closeEventSourceIfIdle();
  };
}
