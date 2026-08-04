"use client";

// One email-first door for *creators* — people putting a box up.
//
// It is not the door for playing. Playing needs an account too now, but that
// one is a dialog you meet at the moment you need it, on the box you were
// already looking at, rather than a page you have to find first. Sending a
// player here would be asking them to sign up for a dashboard they have no use
// for, so the footer says so plainly.
//
// Enter an address: if it already has an account we ask for the password
// (login); if it's new we email a 6-digit code and ask for a code plus a
// password (signup). Players never come through here — playing needs no
// account at all — so this page is only for people who want to put a box up.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Boxy } from "@/components/art/boxy";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PasswordInput } from "@/components/password-input";

type Step = "email" | "login" | "signup";

const INPUT =
  "field px-4 py-3";

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
        <Link href="/" className="flex items-center justify-center gap-2">
          <Boxy mood="happy" still className="size-9" />
          <span className="text-lg font-black tracking-tight">Spendbox</span>
        </Link>

        <div className="panel mt-6 rounded-3xl p-6">
          <h1 className="text-2xl font-black tracking-tight">
            {step === "login" ? "Welcome back" : "Create a Spendbox"}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            {step === "email"
              ? "A creator account: put a reward behind a password of your own, and keep 70% of everything hunters spend trying to crack it."
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

        <p className="mt-4 text-center text-sm text-zinc-400">
          Only want to play? You need an account for that too — but you can make
          it on any box, in one step.{" "}
          <Link href="/" className="font-bold text-brass hover:underline">
            Find a safe
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
      style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
      className="btn-chunky w-full rounded-2xl bg-brass px-4 py-3.5 text-ink"
    >
      {busy ? "Working…" : label}
    </button>
  );
}
