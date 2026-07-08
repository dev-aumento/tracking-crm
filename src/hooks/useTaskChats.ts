import { useMemo } from "react";
import { trpc } from "@/providers/trpc";

type TaskRow = {
  id: number;
  title: string;
  assignee?: { name: string | null; avatar?: string | null } | null;
};

function getNotificationTaskId(notification: {
  taskId?: number | null;
  link?: string | null;
}): number | null {
  if (notification.taskId) return notification.taskId;
  if (notification.link?.includes("task=")) {
    const match = notification.link.match(/task=(\d+)/);
    if (match) return Number(match[1]);
  }
  return null;
}

export function useTaskChats() {
  const { data: taskData, isLoading: tasksLoading } = trpc.task.list.useQuery({
    limit: 200,
  });

  const { data: notifData, isLoading: notifsLoading } = trpc.notification.list.useQuery(
    { unreadOnly: true, limit: 50 },
    { refetchInterval: 30000 },
  );

  const allTasks = (taskData?.tasks ?? []) as TaskRow[];

  const unreadTaskIds = useMemo(() => {
    const ids = new Set<number>();
    for (const n of notifData?.notifications ?? []) {
      const taskId = getNotificationTaskId(n);
      if (taskId) ids.add(taskId);
    }
    return ids;
  }, [notifData]);

  const taskChats = useMemo(() => {
    const byTask = new Map<number, { lastMessage: string; lastAt: Date }>();

    for (const n of notifData?.notifications ?? []) {
      const taskId = getNotificationTaskId(n);
      if (!taskId) continue;

      const at = new Date(n.createdAt);
      const existing = byTask.get(taskId);
      if (!existing || at > existing.lastAt) {
        byTask.set(taskId, { lastMessage: n.message, lastAt: at });
      }
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
          unread: true,
          assignee: task.assignee,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b!.lastAt.getTime() - a!.lastAt.getTime()) as Array<{
        taskId: number;
        title: string;
        lastMessage: string;
        lastAt: Date;
        unread: boolean;
        assignee?: TaskRow["assignee"];
      }>;
  }, [notifData, allTasks]);

  return {
    taskChats,
    taskChatsCount: unreadTaskIds.size,
    isLoading: tasksLoading || notifsLoading,
  };
}
