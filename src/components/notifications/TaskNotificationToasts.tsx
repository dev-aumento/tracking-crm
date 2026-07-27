import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import {
  useNotificationStream,
  type StreamNotification,
} from "@/hooks/useNotificationStream";
import {
  dismissNotificationToast,
  readDismissedNotificationIds,
} from "@/lib/notification-toast-prefs";
import { buildTaskNotificationLink } from "@/lib/task-notification-link";
import { invalidateQueriesForNotifications } from "@/lib/invalidate-on-notifications";
import {
  isNotificationAllowedByPrefs,
  useNotificationPrefs,
} from "@/lib/notification-prefs";

function notificationTarget(notif: StreamNotification) {
  if (notif.type === "employee_joined") return "/admin/employees";
  if (
    notif.type === "time_approval_pending" ||
    notif.type === "time_approved" ||
    notif.type === "time_rejected"
  ) {
    return "/time-tracking";
  }
  if (
    notif.type === "leave_request_pending" ||
    notif.type === "leave_approved" ||
    notif.type === "leave_rejected" ||
    notif.type === "leave_cancelled" ||
    notif.type === "holiday_reminder"
  ) {
    return notif.type === "leave_request_pending" || notif.type === "leave_cancelled"
      ? "/leave-management"
      : "/leaves";
  }
  if (notif.type === "project_created" && notif.projectId) {
    return `/projects/${notif.projectId}`;
  }
  if (notif.link?.includes("activity=")) return notif.link;
  if (notif.taskId) return buildTaskNotificationLink(notif.taskId, notif.activityId);
  if (notif.link) return notif.link;
  return null;
}

export function TaskNotificationToasts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const notificationPrefs = useNotificationPrefs(user?.id);
  const markReadMutation = trpc.notification.markRead.useMutation({
    onSuccess: () => utils.notification.list.invalidate(),
  });
  const seenIdsRef = useRef<Set<number>>(new Set());
  const bootstrappedRef = useRef(false);
  const baselineMaxIdRef = useRef(0);

  useEffect(() => {
    seenIdsRef.current = new Set();
    bootstrappedRef.current = false;
    baselineMaxIdRef.current = 0;
  }, [user?.id]);

  const markNotificationSeen = useCallback(
    (notif: StreamNotification) => {
      if (!user) return;
      seenIdsRef.current.add(notif.id);
      dismissNotificationToast(user.id, notif.id);
      if (!notif.read) {
        markReadMutation.mutate({ id: notif.id });
      }
    },
    [markReadMutation, user],
  );

  const showNotificationToast = useCallback(
    (notif: StreamNotification) => {
      if (!user) return;

      const target = notificationTarget(notif);
      const openTarget = () => {
        markNotificationSeen(notif);
        if (target) navigate(target);
      };

      toast(notif.title, {
        id: `notification-${notif.id}`,
        description: notif.message,
        duration: 8000,
        action: target
          ? {
              label: "View",
              onClick: openTarget,
            }
          : undefined,
        onClick: () => {
          if (target) openTarget();
        },
        onDismiss: () => {
          markNotificationSeen(notif);
        },
      });
    },
    [markNotificationSeen, navigate, user],
  );

  const pushNotifications = useCallback(
    (notifications: StreamNotification[]) => {
      if (!user || !bootstrappedRef.current) return;

      const dismissed = readDismissedNotificationIds(user.id);
      const fresh: StreamNotification[] = [];

      for (const notif of notifications) {
        if (notif.read) continue;
        if (notif.id <= baselineMaxIdRef.current) continue;
        if (seenIdsRef.current.has(notif.id) || dismissed.has(notif.id)) continue;
        fresh.push(notif);
      }

      if (fresh.length > 0) {
        invalidateQueriesForNotifications(utils, fresh);
      }

      for (const notif of fresh) {
        seenIdsRef.current.add(notif.id);
        if (!isNotificationAllowedByPrefs(notif, notificationPrefs)) continue;
        showNotificationToast(notif);
      }
    },
    [notificationPrefs, showNotificationToast, user, utils],
  );

  const pushRef = useRef(pushNotifications);
  pushRef.current = pushNotifications;

  useNotificationStream(
    useCallback((notifications: StreamNotification[]) => {
      pushRef.current(notifications);
    }, []),
  );

  const { data, isSuccess, isFetching } = trpc.notification.list.useQuery(
    { limit: 30 },
    {
      enabled: !!user,
      staleTime: 5 * 60_000,
      // Bootstrap once; live updates come from the SSE stream.
      refetchInterval: false,
      refetchOnWindowFocus: false,
    },
  );

  useEffect(() => {
    if (!user || !isSuccess || isFetching) return;

    const notifications = data?.notifications ?? [];

    if (!bootstrappedRef.current) {
      for (const id of readDismissedNotificationIds(user.id)) {
        seenIdsRef.current.add(id);
      }
      for (const notif of notifications) {
        seenIdsRef.current.add(notif.id);
        baselineMaxIdRef.current = Math.max(baselineMaxIdRef.current, notif.id);
      }
      bootstrappedRef.current = true;
      return;
    }

    pushNotifications(notifications as StreamNotification[]);
  }, [data?.notifications, isSuccess, isFetching, pushNotifications, user]);

  return null;
}
