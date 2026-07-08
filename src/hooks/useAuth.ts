import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { AUTH_DISABLED, LOGIN_PATH } from "@/const";
import { trpc } from "@/providers/trpc";
import { mergeProfilePrefs } from "@/lib/profile-prefs";

type AuthUser = {
  id: number;
  unionId: string;
  name: string | null;
  email: string | null;
  avatar: string | null;
  role: "admin" | "manager" | "employee";
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

  const {
    data: user,
    isPending,
    error,
    refetch,
  } = trpc.auth.me.useQuery(undefined, {
    staleTime: 0,
    retry: false,
  });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (result) => {
      utils.auth.me.setData(undefined, result.user);
      await utils.invalidate();
      navigate("/");
    },
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      utils.auth.me.setData(undefined, undefined);
      await utils.invalidate();
      navigate(LOGIN_PATH, { replace: true });
    },
    onError: async () => {
      utils.auth.me.setData(undefined, undefined);
      await utils.invalidate();
      navigate(LOGIN_PATH, { replace: true });
    },
  });

  const login = useCallback(
    (email: string, password: string) => {
      if (AUTH_DISABLED) {
        return Promise.resolve({ user: DEV_USER });
      }
      return loginMutation.mutateAsync({ email, password });
    },
    [loginMutation],
  );

  const logout = useCallback(() => {
    if (AUTH_DISABLED) {
      utils.auth.me.setData(undefined, undefined);
      navigate(LOGIN_PATH, { replace: true });
      return;
    }
    logoutMutation.mutate();
  }, [logoutMutation, navigate, utils.auth.me]);

  const baseUser = AUTH_DISABLED ? (user ?? DEV_USER) : (user ?? null);
  const authResolved = !isPending;
  const effectiveUser = useMemo(
    () =>
      baseUser
        ? mergeProfilePrefs(baseUser, [
            "name",
            "email",
            "department",
            "position",
            "phone",
          ])
        : null,
    [baseUser],
  );

  return useMemo(
    () => ({
      user: effectiveUser,
      isAuthenticated: !!effectiveUser,
      isLoading: !authResolved || logoutMutation.isPending,
      isLoggingIn: loginMutation.isPending,
      loginError: loginMutation.error,
      error,
      login,
      logout,
      refresh: refetch,
    }),
    [
      effectiveUser,
      authResolved,
      logoutMutation.isPending,
      loginMutation.isPending,
      loginMutation.error,
      error,
      login,
      logout,
      refetch,
    ],
  );
}
