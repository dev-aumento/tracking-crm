import { TRPCClientError } from "@trpc/client";
import { useState } from "react";
import { Building2, Loader2, UserRound } from "lucide-react";
import { OrgAuthShell } from "@/components/auth/OrgAuthShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type AuthMode = "login" | "admin" | "client" | "forgot";

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof TRPCClientError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

export default function Login() {
  const {
    login,
    registerAdmin,
    registerClient,
    resetPassword,
    isLoggingIn,
    isRegistering,
    isResettingPassword,
    loginError,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const busy = isLoggingIn || isRegistering || isResettingPassword;

  function switchMode(next: AuthMode) {
    setMode(next);
    setError(null);
    setSuccess(null);
    setPassword("");
    setConfirmPassword("");
  }

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      setError(errorMessage(err, "Unable to sign in. Please try again."));
    }
  }

  async function handleForgotPassword(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email.trim()) {
      setError("Please enter your email");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Password not match");
      return;
    }

    try {
      await resetPassword(email.trim().toLowerCase(), password);
      setSuccess("Password has been updated successfully");
      setPassword("");
      setConfirmPassword("");
      window.setTimeout(() => {
        switchMode("login");
      }, 1500);
    } catch (err) {
      setError(errorMessage(err, "Unable to update password. Please try again."));
    }
  }

  async function handleRegisterAdmin(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name.trim()) {
      setError("Please enter your full name");
      return;
    }
    if (!organizationName.trim()) {
      setError("Please enter your organization name");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      await registerAdmin({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        organizationName: organizationName.trim(),
      });
    } catch (err) {
      setError(errorMessage(err, "Unable to create admin account. Please try again."));
    }
  }

  async function handleRegisterClient(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name.trim()) {
      setError("Please enter your full name");
      return;
    }
    if (!organizationName.trim()) {
      setError("Please enter your organization name");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      await registerClient({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        organizationName: organizationName.trim(),
      });
    } catch (err) {
      setError(errorMessage(err, "Unable to create client account. Please try again."));
    }
  }

  const displayError =
    error ?? (mode === "login" && loginError ? "Invalid email or password" : null);

  const title =
    mode === "admin"
      ? "Join as admin"
      : mode === "client"
        ? "Join as client"
        : mode === "forgot"
          ? "Reset password"
          : "Sign in";

  const subtitle =
    mode === "admin"
      ? "Create your own organization. You will only see your team’s data."
      : mode === "client"
        ? "Create projects and tasks for your workspace — without company HR tools."
        : mode === "forgot"
          ? "Enter a new password for your account."
          : "Welcome back. Sign in to continue.";

  return (
    <OrgAuthShell
      organizationLabel={
        mode === "admin" || mode === "client"
          ? organizationName.trim() || "Your organization"
          : undefined
      }
    >
      <div className="text-center mb-6 -mt-2">
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
      </div>

      {mode === "login" ? (
        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-gray-700">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="name@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 border-gray-200 bg-white text-[15px]"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium text-gray-700">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 border-gray-200 bg-white text-[15px]"
              required
            />
          </div>
          {displayError ? <p className="text-sm text-red-500">{displayError}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full h-11 rounded-lg bg-[#3dd598] hover:bg-[#32c484] disabled:opacity-60 text-gray-900 font-semibold text-[15px] transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            {isLoggingIn ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Signing in...
              </>
            ) : (
              "Continue"
            )}
          </button>
          <div className="text-center">
            <button
              type="button"
              onClick={() => switchMode("forgot")}
              className="text-sm text-[#2563EB] hover:text-[#1D4ED8] hover:underline"
            >
              Forget password?
            </button>
          </div>
        </form>
      ) : null}

      {mode === "forgot" ? (
        <form onSubmit={handleForgotPassword} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="forgot-email" className="text-sm font-medium text-gray-700">
              Email
            </Label>
            <Input
              id="forgot-email"
              type="email"
              autoComplete="email"
              placeholder="name@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 border-gray-200 bg-white text-[15px]"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password" className="text-sm font-medium text-gray-700">
              New password
            </Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 border-gray-200 bg-white text-[15px]"
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-new-password" className="text-sm font-medium text-gray-700">
              Confirm password
            </Label>
            <Input
              id="confirm-new-password"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-11 border-gray-200 bg-white text-[15px]"
              required
              minLength={8}
            />
          </div>
          {displayError ? <p className="text-sm text-red-500">{displayError}</p> : null}
          {success ? <p className="text-sm text-green-600">{success}</p> : null}
          <button
            type="submit"
            disabled={busy || !!success}
            className="w-full h-11 rounded-lg bg-[#3dd598] hover:bg-[#32c484] disabled:opacity-60 text-gray-900 font-semibold text-[15px] transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            {isResettingPassword ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Updating password...
              </>
            ) : (
              "Update password"
            )}
          </button>
          <button
            type="button"
            onClick={() => switchMode("login")}
            className="w-full text-sm text-gray-500 hover:text-gray-800"
          >
            Back to sign in
          </button>
        </form>
      ) : null}

      {mode === "admin" ? (
        <form onSubmit={handleRegisterAdmin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="admin-org" className="text-sm font-medium text-gray-700">
              Organization name
            </Label>
            <Input
              id="admin-org"
              type="text"
              placeholder="Acme Inc."
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              className="h-11 border-gray-200 bg-white text-[15px]"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-name" className="text-sm font-medium text-gray-700">
              Full name
            </Label>
            <Input
              id="admin-name"
              type="text"
              autoComplete="name"
              placeholder="Jane Doe"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-11 border-gray-200 bg-white text-[15px]"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-email" className="text-sm font-medium text-gray-700">
              Email
            </Label>
            <Input
              id="admin-email"
              type="email"
              autoComplete="email"
              placeholder="admin@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 border-gray-200 bg-white text-[15px]"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password" className="text-sm font-medium text-gray-700">
              Password
            </Label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 border-gray-200 bg-white text-[15px]"
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-confirm" className="text-sm font-medium text-gray-700">
              Confirm password
            </Label>
            <Input
              id="admin-confirm"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-11 border-gray-200 bg-white text-[15px]"
              required
              minLength={8}
            />
          </div>
          <p className="text-xs text-gray-500">
            As admin you can manage employees, permissions, projects, tasks, and all workspace
            settings.
          </p>
          {displayError ? <p className="text-sm text-red-500">{displayError}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full h-11 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white font-semibold text-[15px] transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            {isRegistering ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Creating account...
              </>
            ) : (
              "Create admin account"
            )}
          </button>
          <button
            type="button"
            onClick={() => switchMode("login")}
            className="w-full text-sm text-gray-500 hover:text-gray-800"
          >
            Already have an account? Sign in
          </button>
        </form>
      ) : null}

      {mode === "client" ? (
        <form onSubmit={handleRegisterClient} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="client-org" className="text-sm font-medium text-gray-700">
              Organization name
            </Label>
            <Input
              id="client-org"
              type="text"
              placeholder="Acme Inc."
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              className="h-11 border-gray-200 bg-white text-[15px]"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-name" className="text-sm font-medium text-gray-700">
              Full name
            </Label>
            <Input
              id="client-name"
              type="text"
              autoComplete="name"
              placeholder="Jane Doe"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-11 border-gray-200 bg-white text-[15px]"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-email" className="text-sm font-medium text-gray-700">
              Email
            </Label>
            <Input
              id="client-email"
              type="email"
              autoComplete="email"
              placeholder="client@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 border-gray-200 bg-white text-[15px]"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-password" className="text-sm font-medium text-gray-700">
              Password
            </Label>
            <Input
              id="client-password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 border-gray-200 bg-white text-[15px]"
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-confirm" className="text-sm font-medium text-gray-700">
              Confirm password
            </Label>
            <Input
              id="client-confirm"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-11 border-gray-200 bg-white text-[15px]"
              required
              minLength={8}
            />
          </div>
          <p className="text-xs text-gray-500">
            As a client you can create and manage projects and tasks. You will not see employees,
            time tracking, leaves, analytics, or the dashboard.
          </p>
          {displayError ? <p className="text-sm text-red-500">{displayError}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full h-11 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold text-[15px] transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            {isRegistering ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Creating account...
              </>
            ) : (
              "Create client account"
            )}
          </button>
          <button
            type="button"
            onClick={() => switchMode("login")}
            className="w-full text-sm text-gray-500 hover:text-gray-800"
          >
            Already have an account? Sign in
          </button>
        </form>
      ) : null}

      {mode === "login" ? (
        <div className="mt-6 pt-6 border-t border-gray-100 space-y-3">
          <p className="text-center text-xs text-gray-400">New here?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => switchMode("admin")}
              className={cn(
                "h-11 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-800",
                "hover:border-[#2563EB]/40 hover:bg-blue-50/50 transition-colors inline-flex items-center justify-center gap-2",
              )}
            >
              <Building2 size={16} className="text-[#2563EB]" />
              Join as admin
            </button>
            <button
              type="button"
              onClick={() => switchMode("client")}
              className={cn(
                "h-11 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-800",
                "hover:border-teal-500/40 hover:bg-teal-50/40 transition-colors inline-flex items-center justify-center gap-2",
              )}
            >
              <UserRound size={16} className="text-teal-600" />
              Join as client
            </button>
          </div>
          <p className="text-center text-sm text-gray-500 pt-1">
            Employees join via invite.{" "}
            <span className="text-gray-400">Open the link from your admin email</span>
          </p>
        </div>
      ) : null}
    </OrgAuthShell>
  );
}
