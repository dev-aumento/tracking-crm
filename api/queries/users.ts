import type { UserDoc, SafeUser } from "@db/mongo/types";
import { DEFAULT_PERMISSIONS_BY_ROLE } from "@db/mongo/types";
import { Collections } from "@db/mongo/collections";
import { findById, getCollection, insertDoc, updateById } from "./mongo";
import { getEmployeeDefaultPermissions } from "../lib/employee-defaults";
import { createEmployeeFromUser, deactivateEmployeeByUserId, syncEmployeeFromUser } from "./employees";

export type { SafeUser };

export function omitPasswordHash(user: UserDoc): SafeUser {
  const { passwordHash: _, ...safeUser } = user;
  return safeUser;
}

export async function findUserById(id: number) {
  return findById<UserDoc>(Collections.users, id);
}

export async function findUserByEmail(email: string) {
  const col = await getCollection<UserDoc>(Collections.users);
  return col.findOne({ email });
}

export async function findUserByUnionId(unionId: string) {
  const col = await getCollection<UserDoc>(Collections.users);
  return col.findOne({ unionId });
}

export async function updateLastSignIn(userId: number) {
  await updateById<UserDoc>(Collections.users, userId, {
    lastSignInAt: new Date(),
    updatedAt: new Date(),
  });
}

export async function createUser(
  data: Omit<UserDoc, "id" | "createdAt" | "updatedAt" | "lastSignInAt" | "permissions"> & {
    permissions?: string[];
  },
  options?: { inviteId?: number | null },
) {
  const now = new Date();
  const permissions =
    data.permissions ??
    (data.role === "employee"
      ? await getEmployeeDefaultPermissions()
      : DEFAULT_PERMISSIONS_BY_ROLE[data.role] ?? DEFAULT_PERMISSIONS_BY_ROLE.employee);

  const user = await insertDoc<UserDoc>(Collections.users, {
    firstName: null,
    lastName: null,
    secondName: null,
    dateOfBirth: null,
    sex: null,
    city: null,
    notificationLanguage: null,
    headOfDepartmentUserIds: [],
    ...data,
    permissions,
    createdAt: now,
    updatedAt: now,
    lastSignInAt: now,
  });

  if (user.role === "employee") {
    await createEmployeeFromUser(user, { inviteId: options?.inviteId ?? null });
  }

  return user;
}

export async function upsertUser(
  data: Pick<UserDoc, "unionId"> & Partial<Omit<UserDoc, "id">>,
) {
  const existing = await findUserByUnionId(data.unionId);
  const now = new Date();

  if (existing) {
    await updateById<UserDoc>(Collections.users, existing.id, {
      ...data,
      lastSignInAt: now,
      updatedAt: now,
    });
    return findUserById(existing.id);
  }

  return createUser({
    unionId: data.unionId,
    name: data.name ?? null,
    email: data.email ?? null,
    passwordHash: data.passwordHash ?? null,
    avatar: data.avatar ?? null,
    role: data.role ?? "employee",
    status: data.status ?? "active",
    department: data.department ?? null,
    position: data.position ?? null,
    phone: data.phone ?? null,
    permissions: data.permissions,
  });
}
