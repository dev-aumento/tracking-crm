import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import * as cookie from "cookie";
import { Session } from "@contracts/constants";
import type { SafeUser } from "./queries/users";
import { authenticateRequest } from "./lib/auth";
import { DEV_USER, isAuthDisabled } from "./lib/dev-mode";
import { ensureSchema } from "./lib/migrate";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: SafeUser;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  if (isAuthDisabled()) {
    return { req: opts.req, resHeaders: opts.resHeaders, user: DEV_USER };
  }

  const ctx: TrpcContext = { req: opts.req, resHeaders: opts.resHeaders };

  const cookies = cookie.parse(opts.req.headers.get("cookie") || "");
  if (!cookies[Session.cookieName]) {
    return ctx;
  }

  try {
    await ensureSchema();
    ctx.user = await authenticateRequest(opts.req.headers);
  } catch {
    // Invalid or expired session cookie
  }

  return ctx;
}
