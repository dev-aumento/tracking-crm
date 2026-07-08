import * as cookie from "cookie";
import { Session } from "@contracts/constants";
import { Errors } from "@contracts/errors";
import { findUserById, omitPasswordHash } from "../queries/users";
import { getSessionCookieOptions } from "./cookies";
import { signSessionToken, verifySessionToken } from "./session";

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

  const user = await findUserById(claim.userId);
  if (!user) {
    throw Errors.forbidden("User not found. Please sign in again.");
  }

  if (user.status !== "active") {
    throw Errors.forbidden("Account is not active.");
  }

  return omitPasswordHash(user);
}

export async function createSessionForUser(
  userId: number,
  reqHeaders: Headers,
  resHeaders: Headers,
) {
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
