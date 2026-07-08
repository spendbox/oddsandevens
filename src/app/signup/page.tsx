"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Boxes } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/password-input";

// One email-first entry for both signup and login. Enter an email: if it
// already has an account we ask for the password (login); if it's new we email
// a 6-digit code and ask for a code + password (signup).
type Step = "email" | "login" | "signup";

export default function AuthPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const addr = () => email.trim().toLowerCase();

  async function continueEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: addr() }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setBusy(false);
      setError("Enter a valid email address.");
      return;
    }
    if (body?.exists) {
      setBusy(false);
      setStep("login");
      return;
    }
    // New account: email a signup code.
    const start = await fetch("/api/auth/register/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: addr() }),
    });
    setBusy(false);
    if (!start.ok) {
      const b = await start.json().catch(() => null);
      setError(
        b?.error === "too_many_requests"
          ? "Too many code requests — wait a little and try again."
          : "Couldn't send the code. Try again."
      );
      return;
    }
    setStep("signup");
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabaseBrowser().auth.signInWithPassword({
      email: addr(),
      password,
    });
    setBusy(false);
    if (signInError) {
      setError("Wrong password. Try again or reset it.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function completeSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code we emailed you.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/register/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: addr(), code: code.trim(), password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setBusy(false);
      setError(
        body?.error === "invalid_code"
          ? "That code isn't right or has expired. Check your email or resend."
          : body?.error === "email_taken"
            ? "That email already has an account — go back and sign in."
            : body?.error === "weak_password"
              ? "Password must be at least 8 characters."
              : "Couldn't create your account. Try again."
      );
      return;
    }
    const { error: signInError } = await supabaseBrowser().auth.signInWithPassword({
      email: addr(),
      password,
    });
    setBusy(false);
    if (signInError) {
      router.push("/login");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  function restart() {
    setError(null);
    setPassword("");
    setCode("");
    setStep("email");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="animate-fade-up w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 flex items-center justify-center gap-2 text-lg font-bold tracking-tight text-zinc-900"
        >
          <Boxes className="size-5 text-emerald-600" aria-hidden />
          Spend<span className="text-emerald-600">box</span>
        </Link>

        <div className="card p-6 sm:p-8">
          {step === "email" && (
            <form onSubmit={continueEmail}>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900">
                Get started
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Enter your email — we&apos;ll sign you in or set you up.
              </p>
              <label className="mt-6 block">
                <span className="field-label">Email</span>
                <input
                  type="email"
                  required
                  autoFocus
                  placeholder="you@business.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                />
              </label>
              {error && <p className="alert-error mt-4">{error}</p>}
              <button type="submit" disabled={busy} className="btn-primary mt-6 w-full">
                {busy ? "Checking…" : "Continue"}
              </button>
            </form>
          )}

          {step === "login" && (
            <form onSubmit={login}>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900">
                Welcome back
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Enter the password for{" "}
                <span className="font-medium text-zinc-700">{addr()}</span>.
              </p>
              <label className="mt-6 block">
                <span className="field-label">Password</span>
                <PasswordInput
                  required
                  autoFocus
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {error && <p className="alert-error mt-4">{error}</p>}
              <button type="submit" disabled={busy} className="btn-primary mt-6 w-full">
                {busy ? "Signing in…" : "Sign in"}
              </button>
              <div className="mt-3 flex items-center justify-between text-sm">
                <button type="button" onClick={restart} className="text-zinc-500 underline hover:text-zinc-700">
                  Use a different email
                </button>
                <Link href="/reset-password" className="text-zinc-500 underline hover:text-zinc-700">
                  Forgot password?
                </Link>
              </div>
            </form>
          )}

          {step === "signup" && (
            <form onSubmit={completeSignup}>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900">
                Create your account
              </h1>
              <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                We emailed a 6-digit code to{" "}
                <span className="font-medium text-zinc-700">{addr()}</span>.
                Enter it and pick a password.
              </p>
              <label className="mt-5 block">
                <span className="field-label">Verification code</span>
                <input
                  inputMode="numeric"
                  autoFocus
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="input-field text-center font-mono text-2xl tracking-[0.4em]"
                />
              </label>
              <label className="mt-4 block">
                <span className="field-label">Password</span>
                <PasswordInput
                  required
                  minLength={8}
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {error && <p className="alert-error mt-4">{error}</p>}
              <button type="submit" disabled={busy} className="btn-primary mt-6 w-full">
                {busy ? "Creating…" : "Create account"}
              </button>
              <button type="button" onClick={restart} className="btn-ghost mx-auto mt-3 block">
                Use a different email
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
