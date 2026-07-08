import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Collections } from "@db/mongo/collections";
import type { UserDoc } from "@db/mongo/types";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { clearSessionCookie, createSessionForUser } from "./lib/auth";
import { ensureSchema } from "./lib/migrate";
import { isAuthDisabled } from "./lib/dev-mode";
import * as mock from "./lib/mock-store";
import { updateById } from "./queries/connection";
import { verifyPassword } from "./lib/password";
import { findUserByEmail, omitPasswordHash, updateLastSignIn } from "./queries/users";
import { syncEmployeeFromUser } from "./queries/employees";
import {
  buildDisplayName,
  toPersonalInfoView,
} from "./queries/personal-info";

const profileUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().max(320).optional(),
  department: z.string().max(100).nullable().optional(),
  position: z.string().max(100).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  avatar: z.string().max(3_000_000).nullable().optional(),
});

const personalInfoUpdateSchema = z.object({
  firstName: z.string().max(100).nullable().optional(),
  lastName: z.string().max(100).nullable().optional(),
  secondName: z.string().max(100).nullable().optional(),
  email: z.string().email().max(320).optional(),
  department: z.string().max(200).nullable().optional(),
  position: z.string().max(100).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  sex: z.enum(["male", "female", "other", "prefer_not_to_say"]).nullable().optional(),
  notificationLanguage: z.string().max(20).nullable().optional(),
  headOfDepartmentUserIds: z.array(z.number()).optional(),
});

export const authRouter = createRouter({
  me: publicQuery.query(({ ctx }) => ctx.user ?? null),

  getPersonalInfo: authedQuery.query(async ({ ctx }) => {
    if (isAuthDisabled()) {
      return mock.mockGetPersonalInfo(ctx.user.id);
    }
    await ensureSchema();
    return toPersonalInfoView(ctx.user);
  }),

  updatePersonalInfo: authedQuery
    .input(personalInfoUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      if (isAuthDisabled()) {
        return mock.mockUpdatePersonalInfo(ctx.user.id, input);
      }

      await ensureSchema();

      const patch: Partial<UserDoc> = {
        updatedAt: new Date(),
      };

      if (input.firstName !== undefined) patch.firstName = input.firstName;
      if (input.lastName !== undefined) patch.lastName = input.lastName;
      if (input.secondName !== undefined) patch.secondName = input.secondName;
      if (input.email !== undefined) patch.email = input.email;
      if (input.department !== undefined) patch.department = input.department;
      if (input.position !== undefined) patch.position = input.position;
      if (input.phone !== undefined) patch.phone = input.phone;
      if (input.city !== undefined) patch.city = input.city;
      if (input.sex !== undefined) patch.sex = input.sex;
      if (input.notificationLanguage !== undefined) {
        patch.notificationLanguage = input.notificationLanguage;
      }
      if (input.headOfDepartmentUserIds !== undefined) {
        patch.headOfDepartmentUserIds = input.headOfDepartmentUserIds;
      }
      if (input.dateOfBirth !== undefined) {
        patch.dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
      }

      const nextFirst = input.firstName !== undefined ? input.firstName : ctx.user.firstName;
      const nextLast = input.lastName !== undefined ? input.lastName : ctx.user.lastName;
      if (input.firstName !== undefined || input.lastName !== undefined) {
        patch.name = buildDisplayName(nextFirst, nextLast, ctx.user.name);
      }

      const updated = await updateById<UserDoc>(Collections.users, ctx.user.id, patch);
      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      await syncEmployeeFromUser(updated);
      return toPersonalInfoView(omitPasswordHash(updated));
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

      await syncEmployeeFromUser(updated);

      return omitPasswordHash(updated);
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
