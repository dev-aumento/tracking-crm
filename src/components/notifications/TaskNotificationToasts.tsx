import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import {
  notificationListQueryOptions,
  useNotificationStream,
  type StreamNotification,
} from "@/hooks/useNotificationStream";

function notificationTarget(notif: StreamNotification) {
  if (notif.type === "employee_joined") return "/admin/employees";
  if (notif.type === "time_approval_pending") return "/time-tracking";
  if (notif.type === "project_created" && notif.projectId) {
    return `/projects/${notif.projectId}`;
  }
  if (notif.link) return notif.link;
  if (notif.taskId) return `/tasks?task=${notif.taskId}`;
  return null;
}

export function TaskNotificationToasts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const markReadMutation = trpc.notification.markRead.useMutation({
    onSuccess: () => utils.notification.list.invalidate(),
  });
  const seenIdsRef = useRef<Set<number>>(new Set());
  const bootstrappedRef = useRef(false);

  const showNotificationToast = useCallback(
    (notif: StreamNotification) => {
      const target = notificationTarget(notif);
      const openTarget = () => {
        if (!notif.read) {
          markReadMutation.mutate({ id: notif.id });
        }
        if (target) navigate(target);
      };

      toast(notif.title, {
        description: notif.message,
        duration: 6000,
        action: target
          ? {
              label: "View",
              onClick: openTarget,
            }
          : undefined,
        onClick: () => {
          if (target) openTarget();
        },
      });
    },
    [markReadMutation, navigate],
  );

  const pushNotifications = useCallback(
    (notifications: StreamNotification[]) => {
      for (const notif of notifications) {
        if (seenIdsRef.current.has(notif.id)) continue;
        seenIdsRef.current.add(notif.id);
        showNotificationToast(notif);
      }
    },
    [showNotificationToast],
  );

  const pushRef = useRef(pushNotifications);
  pushRef.current = pushNotifications;

  useNotificationStream(
    useCallback((notifications: StreamNotification[]) => {
      pushRef.current(notifications);
    }, []),
  );

  const { data } = trpc.notification.list.useQuery(
    { limit: 30 },
    {
      enabled: !!user,
      ...notificationListQueryOptions,
    },
  );

  useEffect(() => {
    const notifications = data?.notifications ?? [];
    if (!user) return;

    if (!bootstrappedRef.current) {
      for (const notif of notifications) {
        seenIdsRef.current.add(notif.id);
      }
      bootstrappedRef.current = true;
      return;
    }

    pushNotifications(notifications as StreamNotification[]);
  }, [data?.notifications, pushNotifications, user]);

  return null;
}
