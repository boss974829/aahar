import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { authClient, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { AppUser } from "@/lib/auth/use-current-user";
import { Button, ThemeToggle } from "./ui";

export function BootScreen() {
  return (
    <main className="safe-top mx-auto flex min-h-dvh w-full max-w-md flex-col justify-between px-6 py-8">
      <div className="flex justify-end">
        <ThemeToggle />
      </div>
      <div>
        <Brand />
        <p className="mt-5 max-w-xs text-base text-muted">Opening your journal.</p>
      </div>
      <p className="text-sm text-muted">Meals stay encrypted and private.</p>
    </main>
  );
}

function Brand() {
  return (
    <div>
      <p className="kicker">Private journal</p>
      <p className="mt-3 font-display text-6xl italic leading-none text-ink">Aahar</p>
    </div>
  );
}

export function LoginScreen() {
  const [mode, setMode] = useState<"in" | "up">("up");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!email.includes("@")) {
      setError("Enter the email you want on this account.");
      return;
    }
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    setPending(true);
    try {
      if (mode === "up") {
        const res = await authClient.signUp.email({
          email: email.trim(),
          password,
          name: name.trim() || "Friend",
        });
        if (res.error) throw new Error(res.error.message || "Couldn't create that account.");
      } else {
        const res = await authClient.signIn.email({ email: email.trim(), password });
        if (res.error) throw new Error(res.error.message || "Those details didn't match.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in didn't work.");
      setPending(false);
    }
  }

  return (
    <main className="safe-top mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 py-8">
      <div className="flex justify-end">
        <ThemeToggle />
      </div>
      <div className="mt-8">
        <Brand />
        <h1 className="mt-8 text-4xl text-ink">Your own private plate.</h1>
        <p className="mt-3 max-w-sm text-base leading-relaxed text-muted">
          A unique account, BMI to start, then meals by voice or a short clip. Nothing here is public.
        </p>
      </div>
      <div className="mt-8 space-y-3">
        {GROK_PROVIDERS.map((provider) => (
          <Button
            key={provider.providerId}
            variant="quiet"
            className="w-full"
            onClick={() => signIn(provider.providerId, { callbackURL: "/" })}
          >
            Continue with {provider.label}
          </Button>
        ))}
      </div>
      <p className="kicker my-8 text-center">or email</p>
      <form onSubmit={submit} className="space-y-3">
        {mode === "up" ? (
          <label className="block text-sm font-medium">
            Name
            <input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              className="field"
            />
          </label>
        ) : null}
        <label className="block text-sm font-medium">
          Email
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            className="field"
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "up" ? "new-password" : "current-password"}
            className="field"
          />
        </label>
        {error ? <p className="text-sm text-clay">{error}</p> : null}
        <Button id="auth-submit" type="submit" className="w-full" disabled={pending}>
          {pending ? "Please wait…" : mode === "up" ? "Create account" : "Sign in"}
        </Button>
      </form>
      <button
        type="button"
        className="press mt-5 h-11 text-sm font-semibold text-sage"
        onClick={() => {
          setMode((m) => (m === "up" ? "in" : "up"));
          setError(null);
        }}
      >
        {mode === "up" ? "I already have an account" : "Create a new account"}
      </button>
    </main>
  );
}

export function AuthGate({ children }: { children: (user: AppUser) => ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || isPending) return <BootScreen />;
  if (!user) return <LoginScreen />;
  return <>{children(user)}</>;
}

export function LoginOnly() {
  const { user, isPending } = useCurrentUserState();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || isPending) return <BootScreen />;
  if (user) return <Navigate to="/" />;
  return <LoginScreen />;
}
