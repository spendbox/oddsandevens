"use client";

// What a block of extra plays costs here.
//
// Everyone gets three plays a week free. A player who wants more can buy a
// block, and most of that money is the business's — so the business picks the
// number. ₦250 is a fair guess for a café; it is a rounding error for a salon.
//
// The floor exists because Paystack's fee on a tiny transaction eats most of
// it, and a split of what's left isn't worth the transfer.

import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Ticket } from "lucide-react";
import { naira } from "./shared";

interface PriceState {
  priceKobo: number;
  defaultPriceKobo: number;
  minPriceKobo: number;
  lives: number;
  yourSharePercent: number;
  usingDefault: boolean;
}

export function LifePriceSettings({ onSaved }: { onSaved?: () => void }) {
  const [state, setState] = useState<PriceState | null>(null);
  // Held in naira, because that's what a business thinks in.
  const [nairaInput, setNairaInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetch("/api/merchant/life-price")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: PriceState | null) => {
        if (ignore || !body) return;
        setState(body);
        setNairaInput(String(Math.round(body.priceKobo / 100)));
      });
    return () => {
      ignore = true;
    };
  }, []);

  if (!state) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-zinc-400">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Loading your price…
      </p>
    );
  }

  const minNaira = Math.ceil(state.minPriceKobo / 100);
  const typed = Number(nairaInput);
  const valid = Number.isFinite(typed) && typed >= minNaira;
  const kobo = valid ? Math.round(typed * 100) : 0;

  async function save(priceKobo: number | null) {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/merchant/life-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceKobo }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(
        body?.error === "below_minimum"
          ? `The least you can charge is ${naira(body.minPriceKobo)}.`
          : body?.error === "too_high"
            ? "That's higher than anyone will pay. Check the number."
            : "We couldn't save that. Give it another go."
      );
      return;
    }
    setState(body as PriceState);
    setNairaInput(String(Math.round((body as PriceState).priceKobo / 100)));
    setSaved(true);
    onSaved?.();
  }

  return (
    <div>
      <p className="text-sm text-zinc-600">
        Everyone gets three plays a week from you, free. Anyone who wants more
        can buy {state.lives} at a time — and {state.yourSharePercent}% of what
        they pay is yours.
      </p>

      <label className="mt-4 block">
        <span className="field-label">Price for {state.lives} plays</span>
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-zinc-400">₦</span>
          <input
            inputMode="numeric"
            value={nairaInput}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              setNairaInput(e.target.value.replace(/\D/g, "").slice(0, 6));
              setSaved(false);
            }}
            className="input-field w-40 text-base tabular-nums"
          />
        </div>
      </label>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {[...new Set([minNaira, minNaira * 2, minNaira * 4])].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              setNairaInput(String(n));
              setSaved(false);
            }}
            className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 transition hover:bg-zinc-50"
          >
            ₦{n.toLocaleString()}
          </button>
        ))}
      </div>

      {valid ? (
        <p className="mt-3 rounded-xl bg-zinc-50 px-3 py-2.5 text-sm text-zinc-600">
          You keep{" "}
          <span className="font-semibold text-zinc-900">
            {naira(Math.round((kobo * state.yourSharePercent) / 100))}
          </span>{" "}
          of every {naira(kobo)} block.
        </p>
      ) : (
        <p className="mt-3 text-sm text-amber-700">
          The least you can charge is ₦{minNaira.toLocaleString()}.
        </p>
      )}

      {error && <p className="alert-error mt-3">{error}</p>}
      {saved && !error && (
        <p className="mt-3 text-sm font-medium text-emerald-700">
          Saved. Players see the new price straight away.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => void save(kobo)}
          disabled={busy || !valid}
          className="btn-primary"
          style={{ backgroundColor: "var(--brand)" }}
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            <>
              <Ticket className="size-4" aria-hidden />
              Save price
            </>
          )}
        </button>
        {!state.usingDefault && (
          <button
            onClick={() => void save(null)}
            disabled={busy}
            className="btn-secondary"
          >
            <RotateCcw className="size-4" aria-hidden />
            Back to {naira(state.defaultPriceKobo)}
          </button>
        )}
      </div>
    </div>
  );
}
