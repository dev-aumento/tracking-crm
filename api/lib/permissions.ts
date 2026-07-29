import { TRPCError } from "@trpc/server";
import type { SafeUser } from "../queries/users";
import { isAdminOrManagement } from "@/lib/leave-policy";

export function hasPermission(
  user: Pick<SafeUser, "role" | "permissions" | "department">,
  permission: string,
): boolean {
  if (user.role === "admin") return true;
  // Leadership departments review employee hours without personal time tracking
  if (permission === "time.view_team" && isAdminOrManagement(user)) return true;
  return user.permissions?.includes(permission) ?? false;
}

export function hasAnyPermission(
  user: Pick<SafeUser, "role" | "permissions" | "department">,
  permissions: string[],
): boolean {
  return permissions.some((permission) => hasPermission(user, permission));
}

export function assertPermission(
  user: Pick<SafeUser, "role" | "permissions" | "department">,
  permission: string,
) {
  if (!hasPermission(user, permission)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to perform this action",
    });
  }
}

export function assertAnyPermission(
  user: Pick<SafeUser, "role" | "permissions" | "department">,
  permissions: string[],
) {
  if (!hasAnyPermission(user, permissions)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to perform this action",
    });
  }
}

/** Current assignee, change-assignee permission, or edit-all may reassign a task. */
export function canChangeTaskAssignee(
  user: Pick<SafeUser, "id" | "role" | "permissions">,
  currentAssigneeId?: number | null,
) {
  if (hasPermission(user, "tasks.change_assignee")) return true;
  if (hasPermission(user, "tasks.edit_all")) return true;
  if (
    currentAssigneeId != null &&
    Number(currentAssigneeId) === Number(user.id)
  ) {
    return true;
  }
  return false;
}

export function assertCanChangeTaskAssignee(
  user: Pick<SafeUser, "id" | "role" | "permissions">,
  currentAssigneeId: number | null | undefined,
  nextAssigneeId: number | null | undefined,
) {
  const current = currentAssigneeId == null ? null : Number(currentAssigneeId);
  const next = nextAssigneeId == null ? null : Number(nextAssigneeId);
  if (current === next) return;
  if (canChangeTaskAssignee(user, current)) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "You do not have permission to change the task assignee",
  });
}
