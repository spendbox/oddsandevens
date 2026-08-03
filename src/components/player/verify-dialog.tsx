"use client";

// The one time a player is asked for anything.
//
// An address is needed for exactly one reason — a prize has to be sent
// somewhere — so that is what the dialog says, rather than asking people to
// "create an account" for a game that has none.

import { useState } from "react";
import { Mail } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { EMAIL_REGEX } from "@/lib/constants";
import type { PlayerState } from "@/lib/types";
import { usePlayer } from "./player-context";

export function VerifyDialog({ onClose }: { onClose: () => void }) {
  const { adopt } = usePlayer();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    if (!EMAIL_REGEX.test(email.trim())) {
      setError("That doesn't look like an email address.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/player/verify/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    setBusy(false);
    if (res.ok) {
      setStep("code");
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(
        body.error === "too_many_requests"
          ? "Too many codes requested. Try again in an hour."
          : "Couldn't send that code. Check the address and try again."
      );
    }
  }

  async function confirmCode() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/player/verify/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), code: code.trim() }),
    });
    setBusy(false);
    if (res.ok) {
      const body = (await res.json()) as { player: PlayerState };
      adopt(body.player);
      onClose();
    } else {
      setError("That code didn't match. Check it, or send a new one.");
    }
  }

  return (
    <Modal
      title={step === "email" ? "Where should the prize go?" : "Check your email"}
      subtitle={
        step === "email"
          ? "One code, once. We'll remember you for six months."
          : `We sent a 6-digit code to ${email.trim()}.`
      }
      icon={<Mail className="size-5 text-brass" aria-hidden />}
      width="sm"
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy}
          onClick={() => void (step === "email" ? sendCode() : confirmCode())}
          className="w-full rounded-xl bg-brass px-4 py-3 font-semibold text-zinc-950 transition hover:bg-brass-bright disabled:opacity-50"
        >
          {busy ? "Working…" : step === "email" ? "Send me a code" : "Verify"}
        </button>
      }
    >
      <div className="space-y-3 pb-1">
        {step === "email" ? (
          <input
            type="email"
            autoFocus
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void sendCode()}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-zinc-900 outline-none focus:border-brass"
          />
        ) : (
          <input
            autoFocus
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && void confirmCode()}
            placeholder="000000"
            className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-zinc-900 outline-none focus:border-brass"
          />
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        {step === "code" && (
          <button
            type="button"
            onClick={() => setStep("email")}
            className="text-sm text-zinc-500 underline"
          >
            Use a different address
          </button>
        )}
      </div>
    </Modal>
  );
}
