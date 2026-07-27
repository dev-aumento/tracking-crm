/** Session-scoped auth snapshot so reloads can paint the shell before auth.me returns. */

export type CachedAuthUser = {
  id: number;
  unionId: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  role: "admin" | "manager" | "employee" | "hr" | "client";
  status: "active" | "inactive" | "suspended";
  department: string | null;
  position: string | null;
  phone: string | null;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
  lastSignInAt: Date;
};

const AUTH_CACHE_KEY = "tracker.auth.me.v1";

export function readAuthCache(): CachedAuthUser | undefined {
  try {
    const raw = sessionStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CachedAuthUser;
    if (!parsed?.id || !parsed?.role || !parsed?.status) return undefined;
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
      updatedAt: new Date(parsed.updatedAt),
      lastSignInAt: new Date(parsed.lastSignInAt),
    };
  } catch {
    return undefined;
  }
}

export function writeAuthCache(user: CachedAuthUser | null | undefined) {
  try {
    if (!user) {
      sessionStorage.removeItem(AUTH_CACHE_KEY);
      return;
    }
    sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(user));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function clearAuthCache() {
  writeAuthCache(null);
}
