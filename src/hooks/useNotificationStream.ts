import { useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import {
  registerNotificationStreamInvalidator,
  subscribeNotificationStream,
  type StreamNotification,
} from "@/lib/notification-stream-client";

export type { StreamNotification };

export const notificationListQueryOptions = {
  staleTime: 0,
  refetchInterval: 10_000,
  refetchIntervalInBackground: true,
  refetchOnWindowFocus: true,
} as const;

function useNotificationInvalidation() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!user) return;

    return registerNotificationStreamInvalidator(() => {
      void utils.notification.list.invalidate();
    });
  }, [user, utils]);
}

export function useNotificationStream(
  onNewNotifications?: (notifications: StreamNotification[]) => void,
) {
  useNotificationInvalidation();

  useEffect(() => {
    if (!onNewNotifications) return;
    return subscribeNotificationStream(onNewNotifications);
  }, [onNewNotifications]);
}

export function useNotificationStreamInvalidation() {
  useNotificationInvalidation();
}
