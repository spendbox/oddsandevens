"use client";

// Password reset for contributors: email in, 6-digit code out, new password in.
// The route never says whether an address has an account — it always claims to
// have sent a code — so this page can't be used to enumerate users.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/password-input";

const INPUT =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brass";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const addr = () => email.trim().toLowerCase();

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/password/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: addr() }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Enter a valid email address.");
      return;
    }
    setStep("code");
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/password/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: addr(), code: code.trim(), password }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setBusy(false);
      setError(
        body?.error === "weak_password"
          ? "Use at least 8 characters."
          : "That code didn't match. Check it and try again."
      );
      return;
    }

    const { error: signInError } = await supabaseBrowser().auth.signInWithPassword({
      email: addr(),
      password,
    });
    setBusy(false);
    router.replace(signInError ? "/signup" : "/dashboard");
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center justify-center gap-2 font-semibold">
          <Lock className="size-5 text-brass" aria-hidden />
          Spendbox
        </Link>

        <div className="panel mt-6 rounded-2xl p-6">
          <h1 className="text-xl font-bold tracking-tight">Reset your password</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {step === "email"
              ? "We'll email you a 6-digit code."
              : `If ${addr()} has an account, a code is on its way.`}
          </p>

          {step === "email" ? (
            <form onSubmit={requestCode} className="mt-5 space-y-3">
              <input
                type="email"
                autoFocus
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={INPUT}
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-brass px-4 py-3 font-semibold text-zinc-950 transition hover:bg-brass-bright disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send code"}
              </button>
            </form>
          ) : (
            <form onSubmit={reset} className="mt-5 space-y-3">
              <input
                autoFocus
                required
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className={`${INPUT} text-center font-mono text-2xl tracking-[0.4em]`}
              />
              <PasswordInput
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password (8+ characters)"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-brass px-4 py-3 font-semibold text-zinc-950 transition hover:bg-brass-bright disabled:opacity-50"
              >
                {busy ? "Working…" : "Set new password"}
              </button>
            </form>
          )}

          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </div>

        <p className="mt-4 text-center text-sm text-zinc-600">
          <Link href="/signup" className="hover:text-zinc-400">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
