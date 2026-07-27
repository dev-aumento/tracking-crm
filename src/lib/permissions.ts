import { ROUTE_PERMISSIONS } from "@contracts/permissions";
import { isHrDepartmentUser, isHrRestrictedPath } from "@/lib/leave-policy";

export type AppRole = "admin" | "manager" | "employee" | "hr" | "client";

type PermissionUser = {
  role: AppRole;
  permissions?: string[];
  department?: string | null;
};

export function hasPermission(user: PermissionUser | null | undefined, permission: string) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return user.permissions?.includes(permission) ?? false;
}

export function hasAnyPermission(
  user: PermissionUser | null | undefined,
  permissions: string[],
) {
  return permissions.some((permission) => hasPermission(user, permission));
}

/** First route a user can open after login (clients have no dashboard). */
export function getDefaultHomePath(user: PermissionUser | null | undefined): string {
  if (!user) return "/";
  const candidates = ["/", "/projects", "/admin/tasks", "/tasks"];
  for (const path of candidates) {
    if (canAccessRoute(user, path)) return path;
  }
  return "/settings";
}

function isClientRestrictedPath(path: string): boolean {
  if (path === "/" || path === "") return true;
  if (path === "/leaves" || path.startsWith("/leaves")) return true;
  if (path === "/leave-management" || path.startsWith("/leave-management")) return true;
  if (path === "/recent-employees" || path.startsWith("/recent-employees")) return true;
  if (path === "/time-tracking" || path.startsWith("/time-tracking")) return true;
  if (path === "/analytics" || path.startsWith("/analytics")) return true;
  if (path === "/admin/employees" || path.startsWith("/admin/employees")) return true;
  if (path === "/admin/permissions" || path.startsWith("/admin/permissions")) return true;
  return false;
}

export function canAccessRoute(user: PermissionUser | null | undefined, path: string) {
  if (isHrDepartmentUser(user) && isHrRestrictedPath(path)) {
    return false;
  }

  if (user?.role === "client" && isClientRestrictedPath(path)) {
    return false;
  }

  const exact = ROUTE_PERMISSIONS[path];
  if (exact) {
    return Array.isArray(exact)
      ? hasAnyPermission(user, exact)
      : hasPermission(user, exact);
  }

  if (path.startsWith("/projects/")) {
    if (isHrDepartmentUser(user)) return false;
    return hasAnyPermission(user, ["projects.view", "projects.manage"]);
  }

  if (
    path.startsWith("/tasks/task=") ||
    path.startsWith("/tasks/task/view/")
  ) {
    return canAccessRoute(user, "/tasks");
  }

  if (path.startsWith("/admin/tasks/")) {
    return canAccessRoute(user, "/admin/tasks");
  }

  if (path.startsWith("/admin/")) {
    const role = String(user?.role ?? "").toLowerCase();
    return role === "admin" || role === "manager" || role === "hr";
  }

  return true;
}
