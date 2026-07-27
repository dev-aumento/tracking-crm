import { useMemo } from "react";
import { useStableTaskChatOrder } from "@/lib/stable-list-order";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { hasPermission } from "@/lib/permissions";
import { isHrDepartmentUser } from "@/lib/leave-policy";
import { parseTaskIdFromLink } from "@/lib/task-notification-link";
import { notificationListQueryOptions } from "@/hooks/useNotificationStream";

type TaskRow = {
  id: number;
  title: string;
  assigneeId?: number | null;
  assignee?: { name: string | null; avatar?: string | null } | null;
};

function getNotificationTaskId(notification: {
  taskId?: number | null;
  link?: string | null;
}): number | null {
  if (notification.taskId) return notification.taskId;
  return parseTaskIdFromLink(notification.link);
}

type UseTaskChatsOptions = {
  /** When false, skip the heavy task list + notification fan-out (Sidebar uses badge-only). */
  enabled?: boolean;
};

export function useTaskChats(options?: UseTaskChatsOptions) {
  const enabled = options?.enabled ?? true;
  const { user } = useAuth();
  const isHr = isHrDepartmentUser(user);
  const canViewAllTaskChats =
    user?.role === "admin" || hasPermission(user, "tasks.view_all");

  const listInput = useMemo(
    () => ({
      limit: 200,
      // Employees: only their assigned tasks. Admins / view-all: every task.
      ...(canViewAllTaskChats || !user?.id ? {} : { assigneeId: user.id }),
    }),
    [canViewAllTaskChats, user?.id],
  );

  const queryEnabled = enabled && !isHr;

  const { data: taskData, isLoading: tasksLoading } = trpc.task.list.useQuery(listInput, {
    enabled: queryEnabled,
    staleTime: 60_000,
  });

  // Include read + unread so "Mark all as read" keeps conversations visible.
  const { data: notifData, isLoading: notifsLoading } = trpc.notification.list.useQuery(
    { unreadOnly: false, limit: 100 },
    { ...notificationListQueryOptions, enabled: queryEnabled },
  );

  const allTasks = queryEnabled ? ((taskData?.tasks ?? []) as TaskRow[]) : [];

  const allowedTaskIds = useMemo(() => new Set(allTasks.map((t) => t.id)), [allTasks]);

  const rawTaskChats = useMemo(() => {
    if (!queryEnabled) return [];

    const byTask = new Map<
      number,
      { lastMessage: string; lastAt: Date; unread: boolean }
    >();

    for (const n of notifData?.notifications ?? []) {
      const taskId = getNotificationTaskId(n);
      if (!taskId || !allowedTaskIds.has(taskId)) continue;

      const at = new Date(n.createdAt);
      const existing = byTask.get(taskId);
      if (!existing) {
        byTask.set(taskId, {
          lastMessage: n.message,
          lastAt: at,
          unread: !n.read,
        });
        continue;
      }

      if (at > existing.lastAt) {
        existing.lastMessage = n.message;
        existing.lastAt = at;
      }
      if (!n.read) existing.unread = true;
    }

    return [...byTask.entries()]
      .map(([taskId, meta]) => {
        const task = allTasks.find((t) => t.id === taskId);
        if (!task) return null;
        return {
          taskId,
          title: task.title,
          lastMessage: meta.lastMessage,
          lastAt: meta.lastAt,
          unread: meta.unread,
          assignee: task.assignee,
        };
      })
      .filter(Boolean) as Array<{
      taskId: number;
      title: string;
      lastMessage: string;
      lastAt: Date;
      unread: boolean;
      assignee?: TaskRow["assignee"];
    }>;
  }, [notifData, allTasks, allowedTaskIds, queryEnabled]);

  const taskChats = useStableTaskChatOrder(rawTaskChats);

  const unreadTaskCount = useMemo(
    () => taskChats.filter((chat) => chat.unread).length,
    [taskChats],
  );

  return {
    taskChats,
    taskChatsCount: queryEnabled ? unreadTaskCount : 0,
    isLoading: queryEnabled ? tasksLoading || notifsLoading : false,
  };
}

/** Lightweight Sidebar badge — no 200-task list fetch. */
export function useTaskChatBadgeCount() {
  const { user } = useAuth();
  const isHr = isHrDepartmentUser(user);

  const { data } = trpc.notification.list.useQuery(
    { unreadOnly: true, limit: 50 },
    {
      ...notificationListQueryOptions,
      enabled: !!user && !isHr,
    },
  );

  return useMemo(() => {
    if (isHr) return 0;
    const taskIds = new Set<number>();
    for (const n of data?.notifications ?? []) {
      const taskId = getNotificationTaskId(n);
      if (taskId) taskIds.add(taskId);
    }
    return taskIds.size;
  }, [data?.notifications, isHr]);
}
