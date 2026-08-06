"use client";

// How would you like to pay?
//
// Two rows, and they are not cosmetic variants of each other — they end in
// genuinely different places, and the chooser is honest about that rather than
// pretending both are "checkout":
//
//   Transfer  stays here. We show a one-time account number in our own sheet,
//             in our own house style, and watch for the money ourselves.
//   Card      opens Paystack's form over the page. Their iframe, their styling,
//             because a card form we drew would put raw card numbers in our DOM
//             and drag the whole application into PCI DSS SAQ D.
//
// Transfer is first and is the recommended one, which is a design position as
// well as a compliance one: it is the path that never leaves the game.

import { Building2, CreditCard, ShieldCheck } from "lucide-react";
import type { PayMethod } from "@/lib/checkout-server";

export function PayMethodPicker({
  value,
  onPick,
  disabled,
}: {
  value: PayMethod;
  onPick: (method: PayMethod) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
        How to pay
      </p>

      <div className="grid gap-2">
        <Choice
          on={value === "transfer"}
          disabled={disabled}
          onPick={() => onPick("transfer")}
          icon={<Building2 className="size-5" aria-hidden />}
          title="Bank transfer"
          body="We give you an account number. Stays right here."
        />
        <Choice
          on={value === "card"}
          disabled={disabled}
          onPick={() => onPick("card")}
          icon={<CreditCard className="size-5" aria-hidden />}
          title="Card"
          body="Opens Paystack's secure card form over this page."
        />
      </div>

      <p className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500">
        <ShieldCheck className="size-3.5 text-mint" aria-hidden />
        Secured by Paystack. We never see your card details.
      </p>
    </div>
  );
}

function Choice({
  on,
  disabled,
  onPick,
  icon,
  title,
  body,
}: {
  on: boolean;
  disabled?: boolean;
  onPick: () => void;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-pressed={on}
      className={
        "flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition duration-200 disabled:opacity-50 " +
        (on
          ? "-translate-y-0.5 border-brass bg-brass/15 shadow-[0_0_0_3px_var(--brass-deep)]"
          : "border-white/12 bg-white/5 hover:border-white/30")
      }
    >
      <span className={on ? "text-brass" : "text-zinc-400"}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black tracking-tight">{title}</span>
        <span className="block text-xs leading-snug text-zinc-400">{body}</span>
      </span>
    </button>
  );
}
