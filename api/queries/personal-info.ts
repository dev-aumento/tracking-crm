import type { SafeUser, SexOption, UserDoc } from "@db/mongo/types";
import { findById } from "./mongo";
import { Collections } from "@db/mongo/collections";

export type PersonalInfoRecord = {
  firstName: string | null;
  lastName: string | null;
  secondName: string | null;
  email: string | null;
  position: string | null;
  department: string | null;
  phone: string | null;
  city: string | null;
  dateOfBirth: Date | null;
  sex: SexOption | null;
  notificationLanguage: string | null;
  headOfDepartmentUserIds: number[];
};

export type PersonalInfoView = PersonalInfoRecord & {
  headsOfDepartment: Array<{ id: number; name: string | null }>;
};

export function splitDisplayName(name: string | null | undefined) {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function buildDisplayName(
  firstName?: string | null,
  lastName?: string | null,
  fallback?: string | null,
) {
  const combined = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ");
  return combined || fallback?.trim() || null;
}

export function personalFieldsFromUser(user: SafeUser | UserDoc): PersonalInfoRecord {
  const split = splitDisplayName(user.name);
  return {
    firstName: user.firstName ?? split.firstName ?? null,
    lastName: user.lastName ?? split.lastName ?? null,
    secondName: user.secondName ?? null,
    email: user.email ?? null,
    position: user.position ?? null,
    department: user.department ?? null,
    phone: user.phone ?? null,
    city: user.city ?? null,
    dateOfBirth: user.dateOfBirth ?? null,
    sex: user.sex ?? null,
    notificationLanguage: user.notificationLanguage ?? null,
    headOfDepartmentUserIds: user.headOfDepartmentUserIds ?? [],
  };
}

export async function resolveHeadsOfDepartment(userIds: number[]) {
  const unique = [...new Set(userIds.filter((id) => id > 0))];
  const heads = await Promise.all(
    unique.map(async (id) => {
      const user = await findById<UserDoc>(Collections.users, id);
      return user ? { id: user.id, name: user.name } : null;
    }),
  );
  return heads.filter((h): h is { id: number; name: string | null } => h != null);
}

export async function toPersonalInfoView(user: SafeUser | UserDoc): Promise<PersonalInfoView> {
  const record = personalFieldsFromUser(user);
  const headsOfDepartment = await resolveHeadsOfDepartment(record.headOfDepartmentUserIds);
  return { ...record, headsOfDepartment };
}
