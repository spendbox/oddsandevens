"use client";

// Signing in, signing up, and forgetting your password.
//
// This used to be one screen: type an address, get a code, play. That was the
// right shape when the only thing behind an address was a life pool. It is the
// wrong shape now that there is money behind it — a reward waiting, a bank
// account on file — because a six-digit code to an inbox is the *only* thing
// standing between anybody and that, and an inbox you have lost is a wallet you
// have lost.
//
// So: a password. The flow is one question deep and branches on the answer,
// which keeps a returning player to two fields and a new one to four:
//
//   address → known, has a password  → password           → in
//           → known, no password yet → code → password    → in
//           → new                    → code → password    → in
//   "forgot"                         → code → password    → in
//
// The cookie still does the remembering. A password is how you get a *new*
// cookie on a new device, not something anybody types every visit.

import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, Mail } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Boxy } from "@/components/art/boxy";
import { EMAIL_REGEX } from "@/lib/constants";
import { MIN_PASSWORD_LENGTH } from "@/lib/player-password";
import type { PlayerState } from "@/lib/types";
import { usePlayer } from "./player-context";

type Step = "email" | "password" | "code";

/** `field` does the surface; this is only the spacing around the label. */
const INPUT = "field mt-1.5 px-4 py-3";

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const { adopt } = usePlayer();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [reveal, setReveal] = useState(false);
  /** True once we know this address is new, or is resetting. */
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const addr = email.trim().toLowerCase();

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/player/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }

  async function sendCode() {
    const res = await fetch("/api/player/verify/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: addr }),
    });
    return res.ok;
  }

  /** Step 1: who is this, and which form do they need? */
  async function identify() {
    if (!EMAIL_REGEX.test(addr)) {
      setError("That doesn't look like an email address.");
      return;
    }
    setBusy(true);
    setError(null);
    const { res, body } = await post({ action: "check", email: addr });
    if (!res.ok) {
      setBusy(false);
      setError("Couldn't reach us. Try again in a moment.");
      return;
    }

    if (body.hasPassword) {
      setBusy(false);
      setCreating(false);
      setStep("password");
      return;
    }

    // No password yet, whether or not they've played before: prove the address.
    setCreating(true);
    const sent = await sendCode();
    setBusy(false);
    if (!sent) {
      setError("Too many codes for that address. Try again in a little while.");
      return;
    }
    setStep("code");
  }

  async function signIn() {
    setBusy(true);
    setError(null);
    const { res, body } = await post({ action: "sign-in", email: addr, password });
    setBusy(false);
    if (!res.ok) {
      setError(
        body.error === "invalid_credentials"
          ? "That email and password don't match."
          : "Couldn't sign you in. Try again in a moment."
      );
      return;
    }
    adopt(body.player as PlayerState);
    onClose();
  }

  async function setNewPassword() {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    const { res, body } = await post({
      action: "set",
      email: addr,
      code: code.trim(),
      password,
    });
    setBusy(false);
    if (!res.ok) {
      setError(
        body.error === "invalid_code"
          ? "That code is wrong or has expired."
          : body.error === "weak_password"
            ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
            : body.error === "too_many_accounts"
              ? "Too many new accounts from this connection today. Try again tomorrow, or sign in to the one you already have."
              : "Couldn't finish that. Try again in a moment."
      );
      return;
    }
    adopt(body.player as PlayerState);
    onClose();
  }

  /** "I've forgotten it" — the same code-then-password path as signing up. */
  async function forgot() {
    setBusy(true);
    setError(null);
    const sent = await sendCode();
    setBusy(false);
    if (!sent) {
      setError("Too many codes for that address. Try again in a little while.");
      return;
    }
    setCreating(true);
    setPassword("");
    setStep("code");
  }

  const title =
    step === "email"
      ? "Play Spendbox"
      : step === "password"
        ? "Welcome back"
        : creating
          ? "Check your email"
          : "Check your email";

  return (
    <Modal
      title={title}
      subtitle={
        step === "email"
          ? "You need an account — a reward has to reach somebody."
          : step === "password"
            ? addr
            : `We sent a 6-digit code to ${addr}.`
      }
      icon={<Boxy mood={step === "email" ? "happy" : "sly"} still />}
      width="sm"
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void (step === "email" ? identify() : step === "password" ? signIn() : setNewPassword())
          }
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky w-full rounded-2xl bg-brass px-4 py-3.5 text-ink"
        >
          {busy
            ? "One moment…"
            : step === "email"
              ? "Continue"
              : step === "password"
                ? "Sign in"
                : "Create my account"}
        </button>
      }
    >
      <div className="space-y-4 pb-1">
        {step !== "email" && (
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setError(null);
              setPassword("");
              setCode("");
            }}
            className="flex items-center gap-1.5 text-sm font-semibold text-zinc-400 transition hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Different email
          </button>
        )}

        {step === "email" && (
          <label className="block">
            <span className="text-sm font-bold text-zinc-300">Email address</span>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
                aria-hidden
              />
              <input
                type="email"
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void identify()}
                placeholder="you@example.com"
                className={`${INPUT} pl-11`}
              />
            </div>
            <span className="mt-2 block text-sm text-zinc-400">
              New here? We’ll set you up on the next screen. Playing is free.
            </span>
          </label>
        )}

        {step === "code" && (
          <>
            <label className="block">
              <span className="text-sm font-bold text-zinc-300">The code</span>
              <input
                inputMode="numeric"
                autoFocus
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className={`${INPUT} text-center font-mono text-2xl tracking-[0.4em]`}
              />
            </label>
            <PasswordField
              label={creating ? "Choose a password" : "Your new password"}
              value={password}
              onChange={setPassword}
              reveal={reveal}
              onReveal={() => setReveal((r) => !r)}
              onSubmit={() => void setNewPassword()}
              autoComplete="new-password"
            />
          </>
        )}

        {step === "password" && (
          <>
            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
              reveal={reveal}
              onReveal={() => setReveal((r) => !r)}
              onSubmit={() => void signIn()}
              autoComplete="current-password"
              autoFocus
            />
            <button
              type="button"
              onClick={() => void forgot()}
              className="text-sm font-bold text-brass underline underline-offset-2"
            >
              I’ve forgotten my password
            </button>
          </>
        )}

        {error && (
          <p className="rounded-xl bg-berry/15 px-3 py-2 text-sm font-bold text-berry">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** A password box with a working show/hide, used three times on this screen. */
function PasswordField({
  label,
  value,
  onChange,
  reveal,
  onReveal,
  onSubmit,
  autoComplete,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  reveal: boolean;
  onReveal: () => void;
  onSubmit: () => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-zinc-300">{label}</span>
      <div className="relative">
        <input
          type={reveal ? "text" : "password"}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          className={`${INPUT} pr-12`}
        />
        <button
          type="button"
          onClick={onReveal}
          aria-label={reveal ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-white/10 hover:text-foreground"
        >
          {reveal ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
    </label>
  );
}

/** The old name, so every call site keeps working. */
export { AccountDialog as VerifyDialog };
