import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { trpc } from "@/providers/trpc";
import {
  notificationListQueryOptions,
  useNotificationStreamInvalidation,
} from "@/hooks/useNotificationStream";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatTimeAgo } from "@/lib/utils";
import { Bell, CheckCheck, Loader2 } from "lucide-react";

type NotificationItem = {
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

function notificationTarget(notif: NotificationItem) {
  if (notif.type === "employee_joined") return "/admin/employees";
  if (notif.type === "time_approval_pending") return "/time-tracking";
  if (notif.type === "project_created" && notif.projectId) {
    return `/projects/${notif.projectId}`;
  }
  if (notif.link) return notif.link;
  if (notif.taskId) return `/tasks?task=${notif.taskId}`;
  return null;
}

export function NotificationMenu() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  useNotificationStreamInvalidation();

  const { data, isLoading } = trpc.notification.list.useQuery(
    { limit: 50 },
    { enabled: open, ...notificationListQueryOptions },
  );

  const { data: badgeData } = trpc.notification.list.useQuery(
    { unreadOnly: true, limit: 1 },
    notificationListQueryOptions,
  );

  const markReadMutation = trpc.notification.markRead.useMutation({
    onSuccess: () => utils.notification.list.invalidate(),
  });

  const markAllReadMutation = trpc.notification.markAllRead.useMutation({
    onSuccess: () => utils.notification.list.invalidate(),
  });

  const notifications = useMemo(() => {
    const list = data?.notifications ?? [];
    return [...list].sort((a, b) => {
      const aUnread = !a.read;
      const bUnread = !b.read;
      if (aUnread !== bUnread) return aUnread ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [data?.notifications]);
  const unreadCount = badgeData?.unreadCount ?? data?.unreadCount ?? 0;

  const handleOpen = (next: boolean) => {
    setOpen(next);
    if (next) utils.notification.list.invalidate();
  };

  const handleNotificationClick = (notif: NotificationItem) => {
    if (!notif.read) {
      markReadMutation.mutate({ id: notif.id });
    }
    const target = notificationTarget(notif);
    if (target) {
      setOpen(false);
      navigate(target);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="Notifications"
        >
          <Bell size={20} className="text-gray-500" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 bg-[#2563EB] text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[380px] p-0 rounded-xl border-gray-200 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {unreadCount > 0
                ? `${unreadCount} unread`
                : "You're all caught up"}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="text-xs font-medium text-[#2563EB] hover:text-[#1D4ED8] flex items-center gap-1 disabled:opacity-50"
            >
              {markAllReadMutation.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <CheckCheck size={12} />
              )}
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          )}

          {!isLoading && notifications.length === 0 && (
            <div className="py-12 text-center px-4">
              <Bell size={28} className="mx-auto text-gray-200 mb-2" />
              <p className="text-sm text-gray-500">No notifications yet</p>
            </div>
          )}

          {!isLoading &&
            notifications.map((notif) => {
              const isUnread = !notif.read;
              const target = notificationTarget(notif as NotificationItem);
              return (
                <button
                  key={notif.id}
                  type="button"
                  onClick={() => handleNotificationClick(notif as NotificationItem)}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                    isUnread ? "bg-blue-50/40" : ""
                  }`}
                >
                  <div
                    className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                      isUnread ? "bg-[#2563EB]" : "bg-transparent"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${isUnread ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>
                      {notif.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{formatTimeAgo(notif.createdAt)}</p>
                  </div>
                  {target && (
                    <span className="text-[10px] text-[#2563EB] shrink-0 mt-1">View</span>
                  )}
                </button>
              );
            })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
