"use client";

// One email-first door for contributors.
//
// Enter an address: if it already has an account we ask for the password
// (login); if it's new we email a 6-digit code and ask for a code plus a
// password (signup). Players never come through here — playing needs no
// account at all — so this page is only for people who want to put a box up.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/password-input";

type Step = "email" | "login" | "signup";

const INPUT =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brass";

export default function AuthPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in — usually someone who pressed back after logging in.
  // Sending them on is the difference between "I'm still signed in" and "it
  // logged me out".
  useEffect(() => {
    let ignore = false;
    supabaseBrowser()
      .auth.getSession()
      .then(({ data }) => {
        if (!ignore && data.session) router.replace("/dashboard");
      });
    return () => {
      ignore = true;
    };
  }, [router]);

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
    const body = (await res.json().catch(() => null)) as { exists?: boolean } | null;
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

    const start = await fetch("/api/auth/register/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: addr() }),
    });
    setBusy(false);
    if (!start.ok) {
      const b = (await start.json().catch(() => null)) as { error?: string } | null;
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
      setError("That password doesn't match.");
      return;
    }
    router.replace("/dashboard");
  }

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/auth/register/complete", {
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
          : body?.error === "email_taken"
            ? "That address already has an account — sign in instead."
            : "That code didn't match. Check it and try again."
      );
      return;
    }

    const { error: signInError } = await supabaseBrowser().auth.signInWithPassword({
      email: addr(),
      password,
    });
    setBusy(false);
    if (signInError) {
      setStep("login");
      return;
    }
    router.replace("/dashboard");
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center justify-center gap-2 font-semibold">
          <Lock className="size-5 text-brass" aria-hidden />
          Spendbox
        </Link>

        <div className="panel mt-6 rounded-2xl p-6">
          <h1 className="text-xl font-bold tracking-tight">
            {step === "login" ? "Welcome back" : "Put a box up"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {step === "email"
              ? "Stake a prize behind a password of your own, and earn from every power-up bought trying to crack it."
              : step === "login"
                ? addr()
                : `We emailed a 6-digit code to ${addr()}.`}
          </p>

          {step === "email" && (
            <form onSubmit={continueEmail} className="mt-5 space-y-3">
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
              <Submit busy={busy} label="Continue" />
            </form>
          )}

          {step === "login" && (
            <form onSubmit={login} className="mt-5 space-y-3">
              <PasswordInput
                autoFocus
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
              />
              <Submit busy={busy} label="Sign in" />
              <div className="flex justify-between text-sm">
                <button
                  type="button"
                  onClick={() => setStep("email")}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  Use another email
                </button>
                <Link href="/reset-password" className="text-zinc-500 hover:text-zinc-300">
                  Forgot it?
                </Link>
              </div>
            </form>
          )}

          {step === "signup" && (
            <form onSubmit={register} className="mt-5 space-y-3">
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
                placeholder="Choose a password (8+ characters)"
              />
              <Submit busy={busy} label="Create account" />
              <button
                type="button"
                onClick={() => setStep("email")}
                className="text-sm text-zinc-500 hover:text-zinc-300"
              >
                Use another email
              </button>
            </form>
          )}

          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </div>

        <p className="mt-4 text-center text-sm text-zinc-600">
          Just want to play?{" "}
          <Link href="/" className="text-brass hover:underline">
            No account needed
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

function Submit({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full rounded-xl bg-brass px-4 py-3 font-semibold text-zinc-950 transition hover:bg-brass-bright disabled:opacity-50"
    >
      {busy ? "Working…" : label}
    </button>
  );
}
