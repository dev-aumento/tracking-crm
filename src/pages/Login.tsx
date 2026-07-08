import { TRPCClientError } from "@trpc/client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { OrgAuthShell } from "@/components/auth/OrgAuthShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";

export default function Login() {
  const { login, isLoggingIn, loginError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      await login(email.trim().toLowerCase(), password);
    } catch (err) {
      const message =
        err instanceof TRPCClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to sign in. Please try again.";
      setError(message);
    }
  }

  const displayError =
    error ??
    (loginError ? "Invalid email or password" : null);

  return (
    <OrgAuthShell>
      <form onSubmit={handleSubmit} className="space-y-5">
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
        {displayError ? (
          <p className="text-sm text-red-500">{displayError}</p>
        ) : null}
        <button
          type="submit"
          disabled={isLoggingIn}
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
      </form>

      <div className="mt-6 pt-6 border-t border-gray-100">
        <p className="text-center text-xs text-gray-400 mb-3">Other login options</p>
        <p className="text-center text-sm text-gray-500">
          Received an invite?{" "}
          <span className="text-gray-400">Open your invite link to join</span>
        </p>
      </div>
    </OrgAuthShell>
  );
}
