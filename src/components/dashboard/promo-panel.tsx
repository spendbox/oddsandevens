"use client";

// The promo safe: a box you don't write the password for.
//
// It is the same product as a custom box from the moment it goes live — same
// play, same shelf, same 70% — and completely different beforehand. There is
// nothing to choose. You pay a small fixed price, the database draws a Brutal
// password nobody will ever see, and we put the prize behind it.
//
// The number that has to be on this screen is how many are left. An offer with
// no end is a feature, and a feature nobody hurries for.

import { useEffect, useState } from "react";
import { Loader2, Sparkles, Share2, Check } from "lucide-react";
import { formatNaira } from "@/lib/game/rewards";
import { DESIGNS, DESIGN_SPECS, type Design } from "@/lib/game/designs";
import { SafeArt } from "@/components/safe/safe-art";
import { PayMethodPicker } from "@/components/player/pay-method";
import { TransferSheet } from "@/components/player/transfer-sheet";
import { isTransfer, openCheckout, type CheckoutStart } from "@/lib/checkout";
import type { PayMethod } from "@/lib/checkout-server";

interface Offer {
  enabled: boolean;
  remaining: number;
  claimed: number;
  maxTotal: number;
  priceKobo: number;
  potKobo: number;
  current: {
    id: string;
    slug: string;
    title: string;
    status: string;
    rewardKobo: number;
    priceKobo: number;
    length: number;
    design: Design;
  } | null;
}

const REFUSALS: Record<string, string> = {
  disabled: "The promotion is closed for now.",
  already_have_one: "You already have one. Finish or crack it first.",
  sold_out: "They’ve all gone.",
  not_migrated: "This needs a migration — run npx supabase db push.",
};

export function PromoPanel({ onBuilt }: { onBuilt: () => void }) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<PayMethod>("transfer");
  const [copied, setCopied] = useState(false);
  const [title, setTitle] = useState("");
  const [design, setDesign] = useState<Design>("midnight");
  const [transfer, setTransfer] = useState<{
    details: NonNullable<CheckoutStart["transfer"]>;
    reference: string;
  } | null>(null);

  const read = async () => {
    const res = await fetch("/api/contributor/promo", { cache: "no-store" });
    if (res.ok) setOffer((await res.json()) as Offer);
    else setError(REFUSALS[String((await res.json()).error)] ?? null);
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await fetch("/api/contributor/promo", { cache: "no-store" });
      if (!live) return;
      if (res.ok) setOffer((await res.json()) as Offer);
    })();
    return () => {
      live = false;
    };
  }, []);

  /*
   * Create, then hand straight to the ordinary funding checkout.
   *
   * The promo price is already on the box as `funding_kobo`, so the existing
   * fund route charges exactly it and the ordinary settlement puts the box
   * live. Nothing here is a second payment path.
   */
  /**
   * Take one, or pay for the one already taken.
   *
   * `boxId` is what tells those apart, and getting it wrong is what made the
   * Pay button say "you already have one": it always drew a fresh safe first,
   * so the second half — the part that actually opens a checkout — was never
   * reached by anybody who had already reserved theirs.
   *
   * **A checkout has two shapes, not one.** `startCheckout` answers with a
   * one-time account number for a transfer and with an authorization URL for a
   * card, and transfer is the default here as it is everywhere else. Handling
   * only the URL meant every attempt fell through to "the checkout didn't
   * open" — which was true, and useless, because nothing had gone wrong except
   * this function not knowing what it had been given.
   */
  const take = async (boxId?: string) => {
    setBusy(true);
    setError(null);
    try {
      let id = boxId;
      if (!id) {
        const created = await fetch("/api/contributor/promo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, design }),
        });
        const body = (await created.json()) as { error?: string; id?: string };
        if (!created.ok || !body.id) {
          setError(REFUSALS[body.error ?? ""] ?? "That didn’t work. Try again.");
          return;
        }
        id = body.id;
      }

      const res = await fetch(`/api/contributor/boxes/${id}/fund`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method }),
      });
      const body = (await res.json().catch(() => ({}))) as CheckoutStart & {
        result?: string;
        error?: string;
      };

      if (res.ok && isTransfer(body)) {
        setTransfer({ details: body.transfer, reference: body.reference });
        return;
      }
      if (res.ok && (body.accessCode || body.authorizationUrl)) {
        const outcome = await openCheckout(body, () => void read());
        if (outcome === "redirected") return;
        if (outcome === "failed") setError("Couldn’t open checkout. Try again in a moment.");
        return;
      }
      if (body.result === "already_live") {
        await read();
        return;
      }

      // The safe is reserved either way, so say what actually went wrong
      // rather than only that something did.
      setError(
        body.error === "payments_unavailable"
          ? "Payments aren’t switched on yet. Your safe is reserved — pay for it here when they are."
          : `Your safe is reserved, but the checkout didn’t open${body.error ? ` (${body.error})` : ""}. Try paying again below.`
      );
      await read();
    } finally {
      setBusy(false);
    }
  };

  const share = async (slug: string, rewardKobo: number) => {
    const link = `${window.location.origin}/b/${slug}`;
    const text = `I put up a safe with ${formatNaira(rewardKobo)} behind it. Nobody knows the password — not even me. Crack it and it's yours.`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Spendbox", text, url: link });
        return;
      } catch {
        /* dismissed */
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${link}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(link);
    }
  };

  if (!offer) return null;

  const gone = offer.maxTotal > 0 ? offer.claimed / offer.maxTotal : 0;

  if (offer.current) {
    const box = offer.current;
    const awaiting = box.status === "funding";
    return (
      <section className="panel rounded-2xl p-5">
        <Header remaining={offer.remaining} maxTotal={offer.maxTotal} gone={gone} />
        <div className="mt-3 rounded-2xl bg-black/25 p-4 text-center">
          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
            {box.title}
          </p>
          <p className="mt-1 font-mono text-3xl font-black text-brass">
            {formatNaira(box.rewardKobo)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {box.length} characters · nobody has ever seen this password
          </p>
        </div>

        {awaiting ? (
          <>
            <p className="mt-3 text-sm text-zinc-300">
              Reserved, not live. It goes on the board the moment{" "}
              {formatNaira(box.priceKobo)} clears.
            </p>
            <div className="mt-2">
              <PayMethodPicker value={method} onPick={setMethod} disabled={busy} />
            </div>
            <button
              type="button"
              onClick={() => void take(box.id)}
              disabled={busy}
              style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
              className="btn-chunky mt-3 w-full rounded-2xl bg-brass px-4 py-3.5 text-ink disabled:opacity-60"
            >
              {busy ? "Opening…" : `Pay ${formatNaira(box.priceKobo)}`}
            </button>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-zinc-300">
              It’s live. Every power-up and life bought while somebody hunts it
              pays you 70%, and it lands in your Money tab like any other box.
            </p>
            <button
              type="button"
              onClick={() => void share(box.slug, box.rewardKobo)}
              style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
              className="btn-chunky mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brass px-4 py-3.5 text-ink"
            >
              {copied ? <Check className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
              {copied ? "Link copied" : "Share it"}
            </button>
            <p className="mt-2 text-center text-[11px] text-zinc-500">
              Nobody hunting it means nobody spending on it. Sharing is the whole job.
            </p>
          </>
        )}
        {error && <p className="mt-2 text-sm text-berry">{error}</p>}
        {transfer && (
          <TransferSheet
            transfer={transfer.details}
            reference={transfer.reference}
            what={box.title}
            onPaid={() => {
              setTransfer(null);
              void read();
            }}
            onClose={() => setTransfer(null)}
          />
        )}
      </section>
    );
  }

  return (
    <section className="panel rounded-2xl p-5">
      <Header remaining={offer.remaining} maxTotal={offer.maxTotal} gone={gone} />

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Figure label="You pay" value={formatNaira(offer.priceKobo)} hint="once, to put it up" />
        <Figure label="Behind it" value={formatNaira(offer.potKobo)} hint="ours, not yours" tone="text-brass" />
      </div>

      <ul className="mt-3 space-y-1 text-xs text-zinc-500">
        <li>· The password is drawn by the database. You never see it, and neither do we.</li>
        <li>· Letters and digits, and long — a Brutal one. Hundreds of attempts.</li>
        <li>· You keep 70% of everything hunters spend on it, like any box of yours.</li>
        <li>· One at a time, and you can’t win your own.</li>
      </ul>

      <label className="mt-3 block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-zinc-500">
          Call it
        </span>
        <input
          value={title}
          maxLength={70}
          placeholder="Ada’s big safe"
          onChange={(e) => setTitle(e.target.value)}
          className="field w-full px-4 py-2.5"
        />
        <span className="mt-1 block text-[11px] text-zinc-600">
          This is the name on the card and in the link. Leave it blank and we’ll
          pick one.
        </span>
      </label>

      <div className="mt-3">
        <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-zinc-500">
          Which safe
        </span>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {DESIGNS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setDesign(key)}
              aria-pressed={design === key}
              title={DESIGN_SPECS[key].name}
              className={
                "rounded-xl border-2 p-1.5 transition " +
                (design === key
                  ? "border-brass bg-brass/10"
                  : "border-white/10 hover:border-white/25")
              }
            >
              <SafeArt design={key} className="mx-auto size-10" />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <PayMethodPicker value={method} onPick={setMethod} disabled={busy} />
      </div>

      <button
        type="button"
        onClick={() => void take()}
        disabled={busy || !offer.enabled || offer.remaining <= 0}
        style={{ "--btn-lip": "var(--grape-deep)" } as React.CSSProperties}
        className="btn-chunky mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-grape px-4 py-3.5 text-white disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="size-4" aria-hidden />
        )}
        {!offer.enabled
          ? "Closed for now"
          : offer.remaining <= 0
            ? "All gone"
            : `Take one — ${formatNaira(offer.priceKobo)}`}
      </button>

      {error && <p className="mt-2 text-sm text-berry">{error}</p>}

      {transfer && (
        <TransferSheet
          transfer={transfer.details}
          reference={transfer.reference}
          what={title.trim() || "your promo safe"}
          onPaid={() => {
            setTransfer(null);
            void read();
            onBuilt();
          }}
          onClose={() => setTransfer(null)}
        />
      )}
    </section>
  );
}

function Header({
  remaining,
  maxTotal,
  gone,
}: {
  remaining: number;
  maxTotal: number;
  gone: number;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-black uppercase tracking-wide text-zinc-300">
          Promo safe
        </h3>
        <span className="font-mono text-sm font-black text-brass">
          {remaining} left
        </span>
      </div>
      {/* The bar is the offer's clock. A number alone reads as inventory; a
          bar that is two-thirds gone reads as something ending. */}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brass to-berry"
          style={{ width: `${Math.min(100, Math.round(gone * 100))}%` }}
        />
      </div>
      <p className="mt-1 text-[11px] text-zinc-600">
        {maxTotal - remaining} of {maxTotal} taken
      </p>
    </>
  );
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl bg-black/25 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 font-mono text-lg font-black ${tone ?? ""}`}>{value}</p>
      <p className="text-[11px] text-zinc-600">{hint}</p>
    </div>
  );
}
