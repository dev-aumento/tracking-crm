import { buildTaskNotificationLink } from "@/lib/task-notification-link";
import { isPlatformUser } from "@/lib/platform-admin";

export type NotificationTargetInput = {
  type?: string | null;
  taskId?: number | null;
  projectId?: number | null;
  activityId?: number | null;
  relatedOrganizationId?: number | null;
  link?: string | null;
};

export function notificationTarget(
  notif: NotificationTargetInput,
  viewer?: { role?: string | null } | null,
) {
  const type = String(notif.type ?? "");
  if (type === "plan_joined" || type === "plan_updated" || type === "plan_cancelled") {
    if (isPlatformUser(viewer)) {
      return notif.relatedOrganizationId
        ? `/platform/clients/${notif.relatedOrganizationId}`
        : "/platform/clients";
    }
    if (String(viewer?.role ?? "").toLowerCase() === "admin") return "/admin/pricing";
    return "/";
  }
  if (type === "employee_joined") return "/admin/employees";
  if (
    type === "time_approval_pending" ||
    type === "time_approved" ||
    type === "time_rejected"
  ) {
    return "/time-tracking";
  }
  if (
    type === "leave_request_pending" ||
    type === "leave_approved" ||
    type === "leave_rejected" ||
    type === "leave_cancelled" ||
    type === "holiday_reminder"
  ) {
    return type === "leave_request_pending" || type === "leave_cancelled"
      ? "/leave-management"
      : "/leaves";
  }
  if (type === "project_created" && notif.projectId) {
    return `/projects/${notif.projectId}`;
  }
  if (notif.link?.includes("activity=")) return notif.link;
  if (notif.taskId) return buildTaskNotificationLink(notif.taskId, notif.activityId);
  if (notif.link) return notif.link;
  return null;
}
