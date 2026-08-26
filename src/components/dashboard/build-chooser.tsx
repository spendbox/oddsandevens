"use client";

// Two ways to put a box up, and the choice made before either form appears.
//
// They are the same product once live and nothing alike beforehand: one you
// write the password for and fund yourself, the other is drawn for you with
// our money behind it. Putting the promo inside the build form as an option
// would have buried it; putting it beside the form as a peer is what says
// these are two different decisions.

import { useEffect, useState } from "react";
import { KeyRound, Sparkles } from "lucide-react";
import { BuildPanel } from "./build-panel";
import { PromoPanel } from "./promo-panel";
import { formatNaira } from "@/lib/game/rewards";

type Mode = "promo" | "custom" | null;

export function BuildChooser({ onBuilt }: { onBuilt: () => void }) {
  const [mode, setMode] = useState<Mode>(null);
  const [offer, setOffer] = useState<{ remaining: number; priceKobo: number; potKobo: number; enabled: boolean } | null>(
    null
  );

  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await fetch("/api/contributor/promo", { cache: "no-store" });
      if (!live || !res.ok) return;
      const body = (await res.json()) as {
        remaining: number;
        priceKobo: number;
        potKobo: number;
        enabled: boolean;
        current: unknown;
      };
      if (!live) return;
      setOffer(body);
      // Somebody mid-promo lands on it rather than on a chooser they have
      // already answered.
      if (body.current) setMode("promo");
    })();
    return () => {
      live = false;
    };
  }, []);

  if (mode === "custom") {
    return (
      <>
        <Back onBack={() => setMode(null)} />
        <BuildPanel onBuilt={onBuilt} />
      </>
    );
  }
  if (mode === "promo") {
    return (
      <>
        <Back onBack={() => setMode(null)} />
        <PromoPanel onBuilt={onBuilt} />
      </>
    );
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-black uppercase tracking-wide text-zinc-300">
        Put up a box
      </h2>

      <Option
        icon={Sparkles}
        tone="grape"
        title="Promo safe"
        badge={
          offer && offer.enabled && offer.remaining > 0 ? `${offer.remaining} left` : "closed"
        }
        line={
          offer
            ? `${formatNaira(offer.priceKobo)} to put up, ${formatNaira(offer.potKobo)} behind it — ours, not yours.`
            : "A password drawn by the database, with our money behind it."
        }
        note="You never see the password. Neither do we. Limited number."
        disabled={Boolean(offer && (!offer.enabled || offer.remaining <= 0))}
        onPick={() => setMode("promo")}
      />

      <Option
        icon={KeyRound}
        tone="brass"
        title="Custom box"
        line="Your password, your reward, your rules."
        note="You choose everything and fund the prize yourself."
        onPick={() => setMode("custom")}
      />
    </section>
  );
}

function Option({
  icon: Icon,
  tone,
  title,
  badge,
  line,
  note,
  disabled,
  onPick,
}: {
  icon: typeof KeyRound;
  tone: "grape" | "brass";
  title: string;
  badge?: string;
  line: string;
  note: string;
  disabled?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className="panel panel-lift flex w-full items-start gap-3 rounded-2xl p-4 text-left disabled:opacity-50"
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-xl ${
          tone === "grape" ? "bg-grape/15 text-grape" : "bg-brass/15 text-brass"
        }`}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="font-black tracking-tight">{title}</span>
          {badge && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                badge === "closed"
                  ? "bg-white/8 text-zinc-500"
                  : "bg-berry/15 text-berry"
              }`}
            >
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-sm text-zinc-300">{line}</span>
        <span className="mt-0.5 block text-xs text-zinc-500">{note}</span>
      </span>
    </button>
  );
}

function Back({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="mb-2 text-xs font-bold text-zinc-500 transition hover:text-zinc-300"
    >
      ← Both options
    </button>
  );
}
