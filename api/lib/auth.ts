import * as cookie from "cookie";
import { Session } from "@contracts/constants";
import { Errors } from "@contracts/errors";
import type { SafeUser } from "../queries/users";
import { findUserById, omitPasswordHash } from "../queries/users";
import { getSessionCookieOptions } from "./cookies";
import { signSessionToken, verifySessionToken } from "./session";

const AUTH_USER_CACHE_TTL_MS = 20_000;
const authUserCache = new Map<number, { user: SafeUser; expiresAt: number }>();

export function invalidateAuthUserCache(userId?: number) {
  if (typeof userId === "number") {
    authUserCache.delete(userId);
    return;
  }
  authUserCache.clear();
}

export async function authenticateRequest(headers: Headers) {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const token = cookies[Session.cookieName];
  if (!token) {
    throw Errors.forbidden("Invalid authentication token.");
  }

  const claim = await verifySessionToken(token);
  if (!claim) {
    throw Errors.forbidden("Invalid authentication token.");
  }

  const cached = authUserCache.get(claim.userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  const user = await findUserById(claim.userId);
  if (!user) {
    throw Errors.forbidden("User not found. Please sign in again.");
  }

  if (user.status !== "active") {
    throw Errors.forbidden("Account is not active.");
  }

  const safeUser = omitPasswordHash(user);
  authUserCache.set(claim.userId, {
    user: safeUser,
    expiresAt: Date.now() + AUTH_USER_CACHE_TTL_MS,
  });
  return safeUser;
}

export async function createSessionForUser(
  userId: number,
  reqHeaders: Headers,
  resHeaders: Headers,
) {
  invalidateAuthUserCache(userId);
  const token = await signSessionToken({ userId });
  appendSessionCookie(resHeaders, reqHeaders, token);
}

export function appendSessionCookie(
  resHeaders: Headers,
  reqHeaders: Headers,
  token: string,
) {
  const opts = getSessionCookieOptions(reqHeaders);
  resHeaders.append(
    "set-cookie",
    cookie.serialize(Session.cookieName, token, {
      httpOnly: opts.httpOnly,
      path: opts.path,
      sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
      secure: opts.secure,
      maxAge: Session.maxAgeMs / 1000,
    }),
  );
}

export function clearSessionCookie(reqHeaders: Headers, resHeaders: Headers) {
  const opts = getSessionCookieOptions(reqHeaders);
  resHeaders.append(
    "set-cookie",
    cookie.serialize(Session.cookieName, "", {
      httpOnly: opts.httpOnly,
      path: opts.path,
      sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
      secure: opts.secure,
      maxAge: 0,
    }),
  );
}
