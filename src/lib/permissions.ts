import { ROUTE_PERMISSIONS } from "@contracts/permissions";

type PermissionUser = {
  role: "admin" | "manager" | "employee";
  permissions?: string[];
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

export function canAccessRoute(user: PermissionUser | null | undefined, path: string) {
  const exact = ROUTE_PERMISSIONS[path];
  if (exact) {
    return Array.isArray(exact)
      ? hasAnyPermission(user, exact)
      : hasPermission(user, exact);
  }

  if (path.startsWith("/projects/")) {
    return hasAnyPermission(user, ["projects.view", "projects.manage"]);
  }

  if (path.startsWith("/admin/")) {
    return user?.role === "admin" || user?.role === "manager";
  }

  return true;
}
