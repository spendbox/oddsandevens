"use client";

// Paying by bank transfer, in the game's own house style.
//
// This is the half of checkout we are allowed to draw. A transfer needs the
// player to read an account number and type it into their banking app, and an
// account number is just text — nothing sensitive passes through this screen,
// so there is no reason for it to look like somebody else's website. Compare
// the card form, which is Paystack's iframe and always will be: drawing that
// one ourselves would put raw card numbers in our DOM and the whole
// application into PCI DSS SAQ D.
//
// Two things matter more than the styling:
//
//   **The account is one-time and it expires.** So the clock is the loudest
//   thing after the number itself, and when it runs out the sheet says so
//   plainly rather than leaving somebody transferring into a dead account.
//
//   **We are not the ones who decide it was paid.** The browser polls our own
//   verify route, which asks Paystack. A player who closes the tab is still
//   credited, by the webhook, because the webhook was always the reliable path
//   and this is only the impatient one.
//
// "Secured by Paystack" is on it because a screen asking somebody to send money
// to an account number they have never seen has to say who is holding it.

import { useEffect, useRef, useState } from "react";
import { Building2, Check, Copy, Loader2, ShieldCheck, TimerReset } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Boxy } from "@/components/art/boxy";
import { formatNaira } from "@/lib/game/rewards";
import type { TransferDetails } from "@/lib/paystack";

/** How often we ask our own server whether the money has landed. */
const POLL_MS = 4_000;

/**
 * Statuses that mean this payment is over and did not happen.
 *
 * Mirrors `isTerminalFailure` on the server. Anything not in here and not
 * "paid" is still in flight, and the sheet keeps waiting.
 */
const TERMINAL = new Set(["failed", "abandoned", "reversed"]);

export function TransferSheet({
  transfer,
  reference,
  /** What they're buying, for the line above the amount. */
  what,
  onPaid,
  onClose,
}: {
  transfer: TransferDetails;
  reference: string;
  what: string;
  onPaid: (note: string | null) => void;
  onClose: () => void;
}) {
  const [left, setLeft] = useState(() => secondsLeft(transfer.expiresAt));
  const [paid, setPaid] = useState(false);
  const [failed, setFailed] = useState(false);
  const done = useRef(false);

  // The clock. Purely display — expiry is Paystack's to enforce, and a browser
  // whose clock is wrong should not be able to talk itself out of a payment.
  useEffect(() => {
    const id = window.setInterval(() => setLeft(secondsLeft(transfer.expiresAt)), 1000);
    return () => window.clearInterval(id);
  }, [transfer.expiresAt]);

  /*
   * Waiting for the money.
   *
   * Polling rather than anything cleverer, because the event we are waiting for
   * arrives at Paystack and not at this tab, and four seconds is well inside
   * how long a transfer takes to show up. It keeps going after the account
   * expires: a payment made in the last second of the window still lands, and
   * stopping the moment the clock hits zero would be us giving up before the
   * bank has.
   */
  useEffect(() => {
    let cancelled = false;
    const ask = async () => {
      if (done.current) return;
      try {
        const res = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          result?: string;
          note?: string;
        };
        if (cancelled || done.current) return;

        // Only "paid" is paid. Everything else this route returns is either
        // Paystack's own in-flight status — "pending", "pending_bank_transfer",
        // "ongoing" — or a terminal failure, and treating any non-"pending"
        // string as success would credit a purchase the moment a transfer was
        // abandoned. It is the server that settles either way; this poll only
        // decides what the sheet says.
        if (res.ok && body.result === "paid") {
          done.current = true;
          setPaid(true);
          // A beat on the "paid" face before the sheet goes. The purchase has
          // been the point of the last two minutes; closing instantly reads as
          // the app having lost it.
          window.setTimeout(() => onPaid(body.note ?? null), 1400);
          return;
        }
        if (res.ok && TERMINAL.has(String(body.result))) {
          done.current = true;
          setFailed(true);
        }
      } catch {
        // A dropped request is not an answer. Try again on the next tick.
      }
    };
    void ask();
    const id = window.setInterval(() => void ask(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [reference, onPaid]);

  const expired = (left <= 0 || failed) && !paid;

  return (
    <Modal
      title={paid ? "Payment received" : "Transfer to pay"}
      subtitle={paid ? undefined : what}
      icon={<Building2 className="size-5 text-mint" aria-hidden />}
      width="sm"
      onClose={onClose}
      footer={
        <div className="space-y-2.5">
          <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-zinc-500">
            <ShieldCheck className="size-3.5 text-mint" aria-hidden />
            Secured by Paystack
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl border-2 border-white/12 bg-white/5 px-4 py-3 text-sm font-bold text-zinc-300 transition hover:border-white/30"
          >
            {paid ? "Done" : "I'll do this later"}
          </button>
        </div>
      }
    >
      {paid ? (
        <div className="animate-fade-up space-y-3 py-2 text-center">
          <Boxy mood="cheer" className="mx-auto size-24 drop-shadow-2xl" />
          <p className="text-lg font-black tracking-tight text-mint">
            {formatNaira(transfer.amountKobo)} received.
          </p>
          <p className="text-sm text-zinc-400">Back to it.</p>
        </div>
      ) : (
        <div className="space-y-3 pb-1">
          <div className="rounded-2xl bg-black/25 px-3 py-2.5 text-center">
            <p className="text-xs font-bold text-zinc-500">Send exactly</p>
            <p className="brass-text text-3xl font-black tracking-tight">
              {formatNaira(transfer.amountKobo)}
            </p>
          </div>

          <Field label="Bank" value={transfer.bankName} />
          <Field label="Account number" value={transfer.accountNumber} big copy />
          <Field label="Account name" value={transfer.accountName} />

          <p
            className={
              "flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-bold " +
              (expired
                ? "border-berry/40 bg-berry/15 text-berry"
                : "border-white/12 bg-white/5 text-zinc-300")
            }
          >
            <TimerReset className="size-4 shrink-0" aria-hidden />
            {expired ? (
              failed ? (
                "That payment didn't go through. Close this and start again."
              ) : (
                "This account has expired — close this and start the payment again."
              )
            ) : (
              <>
                These details work for{" "}
                <span className="tabular-nums text-brass">{clock(left)}</span>
              </>
            )}
          </p>

          {!expired && (
            <p className="flex items-center justify-center gap-2 text-xs text-zinc-500">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Waiting for your transfer. This updates on its own.
            </p>
          )}

          <p className="text-center text-[11px] leading-relaxed text-zinc-600">
            This account is generated for this one payment. You can close this —
            it still lands.
          </p>
        </div>
      )}
    </Modal>
  );
}

/** One labelled line, optionally the one worth copying. */
function Field({
  label,
  value,
  big = false,
  copy = false,
}: {
  label: string;
  value: string;
  big?: boolean;
  copy?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function take() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // No clipboard permission. The number is on screen to be read, which is
      // what it was always going to be for most people anyway.
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border-2 border-white/12 bg-white/5 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
          {label}
        </p>
        <p
          className={
            "truncate font-mono font-black text-foreground " +
            (big ? "text-xl tracking-wider" : "text-sm")
          }
        >
          {value}
        </p>
      </div>
      {copy && (
        <button
          type="button"
          onClick={() => void take()}
          aria-label={`Copy ${label}`}
          className="flex shrink-0 items-center gap-1 rounded-lg border-2 border-brass/40 bg-brass/12 px-2.5 py-1.5 text-xs font-bold text-brass transition hover:bg-brass/25"
        >
          {copied ? (
            <>
              <Check className="size-3.5" aria-hidden />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-3.5" aria-hidden />
              Copy
            </>
          )}
        </button>
      )}
    </div>
  );
}

function secondsLeft(expiresAt: string | null): number {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
