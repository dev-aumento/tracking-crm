import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { Invite, Workspace } from "@contracts/constants";
import { Collections } from "@db/mongo/collections";
import type { EmployeeInviteDoc, NotificationDoc, UserDoc } from "@db/mongo/types";
import { createRouter, adminQuery, publicQuery } from "./middleware";
import { ensureSchema } from "./lib/migrate";
import { isAuthDisabled } from "./lib/dev-mode";
import * as inviteMock from "./lib/invite-mock";
import { hashPassword } from "./lib/password";
import { createSessionForUser } from "./lib/auth";
import {
  findById,
  getCollection,
  hasMongoConfigured,
  insertDoc,
  updateById,
} from "./queries/connection";
import { createUser, findUserByEmail, omitPasswordHash } from "./queries/users";

function inviteExpiryDate() {
  const date = new Date();
  date.setDate(date.getDate() + Invite.expiryDays);
  return date;
}

function buildInviteUrl(req: Request, token: string) {
  const origin = new URL(req.url).origin;
  return `${origin}/invite/${token}`;
}

async function expireStaleInvites() {
  const col = await getCollection<EmployeeInviteDoc>(Collections.employeeInvites);
  await col.updateMany(
    { status: "pending", expiresAt: { $lt: new Date() } },
    { $set: { status: "expired" } },
  );
}

async function getValidInvite(token: string) {
  await expireStaleInvites();
  const col = await getCollection<EmployeeInviteDoc>(Collections.employeeInvites);
  return col.findOne({ token });
}

async function notifyAdminsOfNewEmployee(
  newUserId: number,
  newUserName: string,
  newUserEmail: string,
) {
  const usersCol = await getCollection<UserDoc>(Collections.users);
  const admins = await usersCol
    .find({ role: "admin", status: "active" })
    .toArray();

  if (admins.length === 0) return;

  const now = new Date();
  const message = `${newUserName || newUserEmail} accepted an invite. Review and assign their access level in Employees.`;

  await Promise.all(
    admins.map((admin) =>
      insertDoc<NotificationDoc>(Collections.notifications, {
        userId: admin.id,
        actorId: newUserId,
        type: "employee_joined",
        title: "New employee joined",
        message,
        taskId: null,
        read: false,
        createdAt: now,
      }),
    ),
  );
}

function useInviteMock() {
  return !hasMongoConfigured();
}

export const inviteRouter = createRouter({
  create: adminQuery
    .input(
      z
        .object({
          department: z.string().max(100).optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      if (useInviteMock()) {
        const invite = inviteMock.mockCreateInvite(ctx.user.id, input?.department);
        return {
          token: invite.token,
          url: buildInviteUrl(ctx.req, invite.token),
          expiresAt: invite.expiresAt,
        };
      }

      await ensureSchema();
      const token = nanoid(Invite.tokenLength);
      const expiresAt = inviteExpiryDate();

      await insertDoc<EmployeeInviteDoc>(Collections.employeeInvites, {
        token,
        invitedBy: ctx.user.id,
        department: input?.department ?? null,
        expiresAt,
        status: "pending",
        acceptedUserId: null,
        acceptedAt: null,
        createdAt: new Date(),
      });

      return {
        token,
        url: buildInviteUrl(ctx.req, token),
        expiresAt,
      };
    }),

  list: adminQuery.query(async ({ ctx }) => {
    if (useInviteMock()) {
      return {
        invites: inviteMock.mockListPendingInvites().map((invite) => ({
          id: invite.id,
          token: invite.token,
          department: invite.department,
          status: invite.status,
          expiresAt: invite.expiresAt,
          acceptedAt: null,
          createdAt: invite.createdAt,
          invitedByName: ctx.user.name,
          url: buildInviteUrl(ctx.req, invite.token),
        })),
      };
    }

    await ensureSchema();
    await expireStaleInvites();

    const col = await getCollection<EmployeeInviteDoc>(Collections.employeeInvites);
    const invites = await col
      .find({ status: "pending" })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    const invitesWithMeta = await Promise.all(
      invites.map(async (invite) => {
        const inviter = await findById<UserDoc>(Collections.users, invite.invitedBy);
        return {
          id: invite.id,
          token: invite.token,
          department: invite.department,
          status: invite.status,
          expiresAt: invite.expiresAt,
          acceptedAt: invite.acceptedAt,
          createdAt: invite.createdAt,
          invitedByName: inviter?.name ?? null,
          url: buildInviteUrl(ctx.req, invite.token),
        };
      }),
    );

    return { invites: invitesWithMeta };
  }),

  revoke: adminQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      if (useInviteMock()) {
        inviteMock.mockRevokeInvite(input.id);
        return { success: true };
      }

      await ensureSchema();
      const invite = await findById<EmployeeInviteDoc>(
        Collections.employeeInvites,
        input.id,
      );
      if (invite?.status === "pending") {
        await updateById<EmployeeInviteDoc>(Collections.employeeInvites, input.id, {
          status: "revoked",
        });
      }
      return { success: true };
    }),

  validate: publicQuery
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      if (useInviteMock()) {
        const invite = inviteMock.mockGetInvite(input.token);
        return {
          valid: !!invite,
          department: invite?.department ?? null,
          invitedByName: null,
          organizationName: Workspace.name,
          expired: false,
        };
      }

      await ensureSchema();
      const invite = await getValidInvite(input.token);

      if (!invite || invite.status !== "pending") {
        return {
          valid: false,
          department: null,
          invitedByName: null,
          organizationName: Workspace.name,
          expired: invite?.status === "expired",
        };
      }

      if (invite.expiresAt < new Date()) {
        return {
          valid: false,
          department: null,
          invitedByName: null,
          organizationName: Workspace.name,
          expired: true,
        };
      }

      const inviter = await findById<UserDoc>(Collections.users, invite.invitedBy);

      return {
        valid: true,
        department: invite.department,
        invitedByName: inviter?.name ?? null,
        organizationName: Workspace.name,
        expired: false,
      };
    }),

  accept: publicQuery
    .input(
      z.object({
        token: z.string().min(1),
        name: z.string().min(1).max(255),
        email: z.string().email().max(320),
        password: z.string().min(8).max(128),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!hasMongoConfigured()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Database is not connected. Set MONGODB_STANDARD_HOSTS in .env and restart the dev server.",
        });
      }

      await ensureSchema();
      const invite = await getValidInvite(input.token);

      if (!invite || invite.status !== "pending") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: invite?.status === "expired"
            ? "This invite link has expired"
            : "This invite link is invalid or has already been used",
        });
      }

      if (invite.expiresAt < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invite link has expired",
        });
      }

      const email = input.email.toLowerCase();
      const existing = await findUserByEmail(email);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with this email already exists",
        });
      }

      const passwordHash = await hashPassword(input.password);
      const now = new Date();

      const user = await createUser({
        unionId: `invite_${nanoid()}`,
        name: input.name,
        email,
        passwordHash,
        avatar: null,
        role: "employee",
        status: "active",
        department: invite.department,
        position: null,
        phone: null,
      }, { inviteId: invite.id });

      await updateById<EmployeeInviteDoc>(Collections.employeeInvites, invite.id, {
        status: "accepted",
        acceptedUserId: user.id,
        acceptedAt: now,
      });

      await notifyAdminsOfNewEmployee(user.id, input.name, email);
      await createSessionForUser(user.id, ctx.req.headers, ctx.resHeaders);

      return { user: omitPasswordHash(user) };
    }),
});
