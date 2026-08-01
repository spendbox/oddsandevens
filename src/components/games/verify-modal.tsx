"use client";

// Email gate for the game player. Same two-step flow (and the same remembered
// address) as the tile board, so a player who verified there walks straight
// into a game.

import { useEffect, useState } from "react";
import { EMAIL_REGEX } from "@/lib/constants";

export const EMAIL_STORAGE_KEY = "tilehunt_email";

export function VerifyModal({
  businessName,
  logoUrl,
  accent,
  initialEmail,
  onVerified,
  onClose,
}: {
  businessName: string;
  logoUrl: string | null;
  accent: string;
  initialEmail: string;
  onVerified: (email: string) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function sendCode(address: string) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/customer/verify/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: address }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        body?.error === "too_many_requests"
          ? "Too many code requests — wait a little and try again."
          : "Couldn't send the code. Try again."
      );
      return;
    }
    setSentTo(address);
    setStep("code");
  }

  async function submitCode() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/customer/verify/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: sentTo, code: code.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("That code isn't right or has expired. Check your email.");
      return;
    }
    onVerified(sentTo);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        className="card w-full max-w-sm p-6 sm:p-7"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (step === "email") {
            const value = email.trim().toLowerCase();
            if (!EMAIL_REGEX.test(value)) {
              setError("Enter a valid email address.");
              return;
            }
            setEmail(value);
            void sendCode(value);
          } else {
            if (!/^\d{6}$/.test(code.trim())) {
              setError("Enter the 6-digit code we emailed you.");
              return;
            }
            void submitCode();
          }
        }}
      >
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="size-10 rounded-xl object-cover"
            />
          ) : (
            <span
              className="flex size-10 items-center justify-center rounded-xl text-sm font-bold text-white"
              style={{ backgroundColor: accent }}
            >
              {businessName.slice(0, 2).toUpperCase()}
            </span>
          )}
          <span className="font-semibold text-zinc-900">{businessName}</span>
        </div>

        {step === "email" ? (
          <>
            <p className="mt-3 text-sm leading-relaxed text-zinc-500">
              Enter your email to play. We&apos;ll send a 6-digit code to confirm
              it&apos;s you — prizes are emailed to that address.
            </p>
            <label className="mt-5 block">
              <span className="field-label">Email</span>
              <input
                type="email"
                required
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
              />
            </label>
            {error && <p className="alert-error mt-3">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              style={{ backgroundColor: accent }}
              className="btn-primary mt-5 w-full"
            >
              {busy ? "Sending code…" : "Send my code"}
            </button>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-zinc-500">
              We emailed a 6-digit code to{" "}
              <span className="font-medium text-zinc-700">{sentTo}</span>.
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
            {error && <p className="alert-error mt-3">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              style={{ backgroundColor: accent }}
              className="btn-primary mt-5 w-full"
            >
              {busy ? "Verifying…" : "Verify & play"}
            </button>
            <button
              type="button"
              onClick={() => sendCode(sentTo)}
              disabled={busy}
              className="btn-ghost mx-auto mt-2 block"
            >
              Resend code
            </button>
          </>
        )}
      </form>
    </div>
  );
}
