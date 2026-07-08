"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Boxes } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/password-input";

// Forgot password: email → 6-digit code (emailed) → new password. Then we sign
// the merchant in with the new password.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "verify">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/password/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Enter a valid email address.");
      return;
    }
    // Always advance — the endpoint doesn't reveal whether the email exists.
    setStep("verify");
  }

  async function completeReset(e: React.FormEvent) {
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
    const addr = email.trim().toLowerCase();
    const res = await fetch("/api/auth/password/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: addr, code: code.trim(), password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setBusy(false);
      setError(
        body?.error === "invalid_code"
          ? "That code isn't right or has expired. Check your email or resend."
          : body?.error === "weak_password"
            ? "Password must be at least 8 characters."
            : "Couldn't reset your password. Try again."
      );
      return;
    }
    const { error: signInError } = await supabaseBrowser().auth.signInWithPassword({
      email: addr,
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
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">
            Reset your password
          </h1>

          {step === "email" ? (
            <form onSubmit={sendCode}>
              <p className="mt-1 text-sm text-zinc-500">
                Enter your account email and we&apos;ll send a reset code.
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
                {busy ? "Sending code…" : "Send reset code"}
              </button>
              <p className="mt-5 text-center text-sm text-zinc-500">
                Remembered it?{" "}
                <Link
                  href="/login"
                  className="font-medium text-emerald-600 hover:text-emerald-500"
                >
                  Sign in
                </Link>
              </p>
            </form>
          ) : (
            <form onSubmit={completeReset}>
              <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                Enter the code sent to{" "}
                <span className="font-medium text-zinc-700">{email}</span> and a
                new password.
              </p>
              <label className="mt-5 block">
                <span className="field-label">Reset code</span>
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
                <span className="field-label">New password</span>
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
                {busy ? "Resetting…" : "Set new password"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep("email");
                }}
                className="btn-ghost mx-auto mt-3 block"
              >
                Use a different email
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
