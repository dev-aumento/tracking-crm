import { useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router";
import { AUTH_DISABLED, LOGIN_PATH } from "@/const";
import { trpc } from "@/providers/trpc";
import { clearAuthCache, readAuthCache, writeAuthCache } from "@/lib/auth-cache";
import { mergeProfilePrefs } from "@/lib/profile-prefs";
import { getDefaultHomePath } from "@/lib/permissions";

type AuthUser = {
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

const DEV_USER: AuthUser = {
  id: 1,
  unionId: "admin_union_001",
  name: "Sandeep",
  email: "sandeep@aumentoinfoway.com",
  avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sandeep",
  role: "admin",
  status: "active",
  department: "Management",
  position: "Project Manager",
  phone: null,
  permissions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignInAt: new Date(),
};

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(_options?: UseAuthOptions) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const cachedUser = useMemo(() => readAuthCache(), []);

  const {
    data: user,
    isPending,
    error,
    refetch,
  } = trpc.auth.me.useQuery(undefined, {
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    // Instant shell on reload while fresh auth.me resolves in the background.
    placeholderData: cachedUser,
  });

  useEffect(() => {
    if (user) {
      writeAuthCache(user);
      return;
    }
    if (!isPending) clearAuthCache();
  }, [user, isPending]);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (result) => {
      writeAuthCache(result.user);
      utils.auth.me.setData(undefined, result.user);
      await utils.invalidate();
      navigate(getDefaultHomePath(result.user));
    },
  });

  const registerAdminMutation = trpc.auth.registerAdmin.useMutation({
    onSuccess: async (result) => {
      writeAuthCache(result.user);
      utils.auth.me.setData(undefined, result.user);
      await utils.invalidate();
      navigate(getDefaultHomePath(result.user));
    },
  });

  const registerClientMutation = trpc.auth.registerClient.useMutation({
    onSuccess: async (result) => {
      writeAuthCache(result.user);
      utils.auth.me.setData(undefined, result.user);
      await utils.invalidate();
      navigate(getDefaultHomePath(result.user));
    },
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      clearAuthCache();
      utils.auth.me.setData(undefined, undefined);
      await utils.invalidate();
      navigate(LOGIN_PATH, { replace: true });
    },
    onError: async () => {
      clearAuthCache();
      utils.auth.me.setData(undefined, undefined);
      await utils.invalidate();
      navigate(LOGIN_PATH, { replace: true });
    },
  });

  const resetPasswordMutation = trpc.auth.resetPassword.useMutation();

  const login = useCallback(
    (email: string, password: string) => {
      if (AUTH_DISABLED) {
        return Promise.resolve({ user: DEV_USER });
      }
      return loginMutation.mutateAsync({ email, password });
    },
    [loginMutation],
  );

  const registerAdmin = useCallback(
    (input: {
      name: string;
      email: string;
      password: string;
      organizationName: string;
    }) => {
      if (AUTH_DISABLED) {
        return Promise.resolve({ user: DEV_USER, organizationName: input.organizationName });
      }
      return registerAdminMutation.mutateAsync(input);
    },
    [registerAdminMutation],
  );

  const registerClient = useCallback(
    (input: {
      name: string;
      email: string;
      password: string;
      organizationName: string;
    }) => {
      if (AUTH_DISABLED) {
        return Promise.resolve({
          user: { ...DEV_USER, role: "client" as const },
          organizationName: input.organizationName,
        });
      }
      return registerClientMutation.mutateAsync(input);
    },
    [registerClientMutation],
  );

  const logout = useCallback(() => {
    if (AUTH_DISABLED) {
      clearAuthCache();
      utils.auth.me.setData(undefined, undefined);
      navigate(LOGIN_PATH, { replace: true });
      return;
    }
    logoutMutation.mutate();
  }, [logoutMutation, navigate, utils.auth.me]);

  const resetPassword = useCallback(
    (email: string, newPassword: string) => {
      if (AUTH_DISABLED) {
        return Promise.resolve({ success: true });
      }
      return resetPasswordMutation.mutateAsync({ email, newPassword });
    },
    [resetPasswordMutation],
  );

  const baseUser = AUTH_DISABLED ? (user ?? DEV_USER) : (user ?? null);
  // With placeholderData, isPending is false immediately on reload so the shell
  // can mount and fire page queries in parallel with the background auth refresh.
  const authResolved = !isPending || !!baseUser;
  // Prefer auth.me for access-control fields (department/role). Local profile
  // prefs must not override department — stale/null prefs were keeping HR users
  // from being recognized, so task/project nav stayed visible.
  const effectiveUser = useMemo(
    () =>
      baseUser
        ? mergeProfilePrefs(baseUser, ["name", "email", "position", "phone"])
        : null,
    [baseUser],
  );

  return useMemo(
    () => ({
      user: effectiveUser,
      isAuthenticated: !!effectiveUser,
      isLoading: !authResolved || logoutMutation.isPending,
      isLoggingIn: loginMutation.isPending,
      isRegistering:
        registerAdminMutation.isPending || registerClientMutation.isPending,
      isResettingPassword: resetPasswordMutation.isPending,
      loginError: loginMutation.error,
      error,
      login,
      registerAdmin,
      registerClient,
      resetPassword,
      logout,
      refresh: refetch,
    }),
    [
      effectiveUser,
      authResolved,
      logoutMutation.isPending,
      loginMutation.isPending,
      registerAdminMutation.isPending,
      registerClientMutation.isPending,
      resetPasswordMutation.isPending,
      loginMutation.error,
      error,
      login,
      registerAdmin,
      registerClient,
      resetPassword,
      logout,
      refetch,
    ],
  );
}
