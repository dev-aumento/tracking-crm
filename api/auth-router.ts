import { createRouter, authedQuery, publicQuery } from "./middleware";
import { clearSessionCookie, createSessionForUser, invalidateAuthUserCache } from "./lib/auth";
import { ensureSchema } from "./lib/migrate";
import { isAuthDisabled } from "./lib/dev-mode";
import * as mock from "./lib/mock-store";
import { updateById, findById } from "./queries/connection";
import { hashPassword, verifyPassword } from "./lib/password";
import { createUser, findUserByEmail, omitPasswordHash, updateLastSignIn } from "./queries/users";
import { syncEmployeeFromUser } from "./queries/employees";
import {
  buildPersonalInfoUserPatch,
  selfPersonalInfoUpdateSchema,
  toPersonalInfoView,
} from "./queries/personal-info";
import { assertPermission, hasPermission } from "./lib/permissions";
import { getOrganizationName } from "./lib/organization";
import { createOrganization, getOrganizationNameById } from "./lib/tenant";
import { ALL_PERMISSION_KEYS } from "@contracts/permissions";
import { Collections } from "@db/mongo/collections";
import type { OrganizationDoc, UserDoc } from "@db/mongo/types";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";

const profileUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  department: z.string().max(100).nullable().optional(),
  position: z.string().max(100).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  avatar: z.string().max(3_000_000).nullable().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null as string | null, lastName: null as string | null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null as string | null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export const authRouter = createRouter({
  me: publicQuery.query(({ ctx }) => ctx.user ?? null),

  organizationName: publicQuery.query(async ({ ctx }) => {
    if (isAuthDisabled()) return { name: "AumentoX26" };
    try {
      await ensureSchema();
      if (ctx.user?.organizationId) {
        return { name: await getOrganizationNameById(ctx.user.organizationId) };
      }
      return { name: await getOrganizationName() };
    } catch {
      return { name: "AumentoX26" };
    }
  }),

  registerAdmin: publicQuery
    .input(
      z.object({
        name: z.string().min(1).max(255),
        email: z.string().email().max(320),
        password: z.string().min(8).max(128),
        organizationName: z.string().min(1).max(200),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        await ensureSchema();
      } catch (error) {
        console.error("[auth] Database setup failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Database setup failed. Check MONGODB_URI and ensure MongoDB is reachable.",
        });
      }

      const email = input.email.trim().toLowerCase();
      const existing = await findUserByEmail(email);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with this email already exists",
        });
      }

      const passwordHash = await hashPassword(input.password);
      const { firstName, lastName } = splitName(input.name);
      const org = await createOrganization(input.organizationName, null);

      const user = await createUser({
        unionId: `admin_${nanoid()}`,
        organizationId: org.id,
        name: input.name.trim(),
        email,
        passwordHash,
        avatar: null,
        role: "admin",
        status: "active" as UserDoc["status"],
        department: "Management",
        position: "Administrator",
        phone: null,
        firstName,
        lastName,
        permissions: [...ALL_PERMISSION_KEYS],
      });

      await updateById<OrganizationDoc>(Collections.organizations, org.id, {
        createdBy: user.id,
        updatedAt: new Date(),
      });

      await createSessionForUser(user.id, ctx.req.headers, ctx.resHeaders);

      return {
        user: omitPasswordHash(user),
        organizationName: org.name,
      };
    }),

  registerClient: publicQuery
    .input(
      z.object({
        name: z.string().min(1).max(255),
        email: z.string().email().max(320),
        password: z.string().min(8).max(128),
        organizationName: z.string().min(1).max(200),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        await ensureSchema();
      } catch (error) {
        console.error("[auth] Database setup failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Database setup failed. Check MONGODB_URI and ensure MongoDB is reachable.",
        });
      }

      const email = input.email.trim().toLowerCase();
      const existing = await findUserByEmail(email);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with this email already exists",
        });
      }

      const passwordHash = await hashPassword(input.password);
      const { firstName, lastName } = splitName(input.name);
      const org = await createOrganization(input.organizationName, null);

      const user = await createUser({
        unionId: `client_${nanoid()}`,
        organizationId: org.id,
        name: input.name.trim(),
        email,
        passwordHash,
        avatar: null,
        role: "client",
        status: "active" as UserDoc["status"],
        department: "Client",
        position: "Client",
        phone: null,
        firstName,
        lastName,
      });

      await updateById<OrganizationDoc>(Collections.organizations, org.id, {
        createdBy: user.id,
        updatedAt: new Date(),
      });

      await createSessionForUser(user.id, ctx.req.headers, ctx.resHeaders);

      return {
        user: omitPasswordHash(user),
        organizationName: org.name,
      };
    }),

  getPersonalInfo: authedQuery.query(async ({ ctx }) => {
    const canManageHead = hasPermission(ctx.user, "profile.head_of_department");

    if (isAuthDisabled()) {
      const view = mock.mockGetPersonalInfo(ctx.user.id, { includePrivateNotes: true });
      if (!canManageHead) {
        return {
          ...view,
          headOfDepartmentUserIds: [],
          headsOfDepartment: [],
        };
      }
      return view;
    }
    await ensureSchema();
    const user = await findById<UserDoc>(Collections.users, ctx.user.id);
    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }
    const view = await toPersonalInfoView(user, { includePrivateNotes: true });
    if (!canManageHead) {
      return {
        ...view,
        headOfDepartmentUserIds: [],
        headsOfDepartment: [],
      };
    }
    return view;
  }),

  updatePersonalInfo: authedQuery
    .input(selfPersonalInfoUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.headOfDepartmentUserIds !== undefined) {
        assertPermission(ctx.user, "profile.head_of_department");
      }

      const canManageHead = hasPermission(ctx.user, "profile.head_of_department");

      if (isAuthDisabled()) {
        const view = mock.mockUpdatePersonalInfo(ctx.user.id, input, {
          includePrivateNotes: true,
        });
        if (!canManageHead) {
          return {
            ...view,
            headOfDepartmentUserIds: [],
            headsOfDepartment: [],
          };
        }
        return view;
      }

      await ensureSchema();

      const patch = buildPersonalInfoUserPatch(input, ctx.user);

      const updated = await updateById<UserDoc>(Collections.users, ctx.user.id, patch);
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      invalidateAuthUserCache(ctx.user.id);
      await syncEmployeeFromUser(updated);
      const view = await toPersonalInfoView(updated, { includePrivateNotes: true });
      if (!canManageHead) {
        return {
          ...view,
          headOfDepartmentUserIds: [],
          headsOfDepartment: [],
        };
      }
      return view;
    }),

  updateProfile: authedQuery
    .input(profileUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      if (isAuthDisabled()) {
        return mock.mockUpdateUserProfile(ctx.user.id, input);
      }

      try {
        await ensureSchema();
      } catch (error) {
        console.error("[auth] Database setup failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database is not available. Check your MongoDB connection.",
        });
      }

      const updated = await updateById<UserDoc>(Collections.users, ctx.user.id, {
        ...input,
        updatedAt: new Date(),
      });

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      invalidateAuthUserCache(ctx.user.id);
      await syncEmployeeFromUser(updated);

      return omitPasswordHash(updated);
    }),

  changePassword: authedQuery
    .input(changePasswordSchema)
    .mutation(async ({ ctx, input }) => {
      if (isAuthDisabled()) {
        return { success: true };
      }

      try {
        await ensureSchema();
      } catch (error) {
        console.error("[auth] Database setup failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database is not available. Check your MongoDB connection.",
        });
      }

      const user = await findById<UserDoc>(Collections.users, ctx.user.id);
      if (!user?.passwordHash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Password change is not available for this account",
        });
      }

      const currentValid = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!currentValid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Current password is incorrect",
        });
      }

      if (input.currentPassword === input.newPassword) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "New password must be different from your current password",
        });
      }

      const passwordHash = await hashPassword(input.newPassword);
      const updated = await updateById<UserDoc>(Collections.users, ctx.user.id, {
        passwordHash,
        updatedAt: new Date(),
      });

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      invalidateAuthUserCache(ctx.user.id);
      await syncEmployeeFromUser(updated);

      return { success: true };
    }),

  resetPassword: publicQuery
    .input(
      z.object({
        email: z.string().email().max(320),
        newPassword: z.string().min(8).max(128),
      }),
    )
    .mutation(async ({ input }) => {
      if (isAuthDisabled()) {
        return { success: true };
      }

      try {
        await ensureSchema();
      } catch (error) {
        console.error("[auth] Database setup failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database is not available. Check your MongoDB connection.",
        });
      }

      const email = input.email.trim().toLowerCase();
      const user = await findUserByEmail(email);
      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No account found with this email",
        });
      }

      if (user.status !== "active") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Account is not active",
        });
      }

      const passwordHash = await hashPassword(input.newPassword);
      const updated = await updateById<UserDoc>(Collections.users, user.id, {
        passwordHash,
        updatedAt: new Date(),
      });

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      invalidateAuthUserCache(user.id);
      await syncEmployeeFromUser(updated);

      return { success: true };
    }),

  login: publicQuery
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        await ensureSchema();
      } catch (error) {
        console.error("[auth] Database setup failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Database setup failed. Check MONGODB_URI and ensure MongoDB is reachable.",
        });
      }

      const user = await findUserByEmail(input.email.toLowerCase());

      if (!user?.passwordHash) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }

      if (user.status !== "active") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Account is not active",
        });
      }

      const valid = await verifyPassword(input.password, user.passwordHash);
      if (!valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }

      await updateLastSignIn(user.id);
      await createSessionForUser(user.id, ctx.req.headers, ctx.resHeaders);

      return { user: omitPasswordHash(user) };
    }),

  logout: publicQuery.mutation(async ({ ctx }) => {
    clearSessionCookie(ctx.req.headers, ctx.resHeaders);
    return { success: true };
  }),
});
