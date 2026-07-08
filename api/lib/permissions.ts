import { TRPCError } from "@trpc/server";
import type { SafeUser } from "../queries/users";

export function hasPermission(
  user: Pick<SafeUser, "role" | "permissions">,
  permission: string,
): boolean {
  if (user.role === "admin") return true;
  return user.permissions?.includes(permission) ?? false;
}

export function hasAnyPermission(
  user: Pick<SafeUser, "role" | "permissions">,
  permissions: string[],
): boolean {
  return permissions.some((permission) => hasPermission(user, permission));
}

export function assertPermission(
  user: Pick<SafeUser, "role" | "permissions">,
  permission: string,
) {
  if (!hasPermission(user, permission)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to perform this action",
    });
  }
}
