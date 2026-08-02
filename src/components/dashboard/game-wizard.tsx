"use client";

// Two steps to a live game.
//
//   1. Pick one — from the games we already wrote for this business, or from
//      the full catalogue.
//   2. Set the prizes for the podium and go live.
//
// Every game is a weekly competition: players chase a public leaderboard, and
// when the week closes the top places get their codes by email. Everything
// else is pre-filled and editable later. The real game plays beside step 2.

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Crown,
  Landmark,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import {
  COMPETITIVE_GAMES,
  DEFAULT_SEASON_DAYS,
  GAMES,
  GAME_TIER_LIMITS,
  competitiveCategories,
  type GameCategory,
  type GameDefinition,
  type GameType,
} from "@/lib/games/catalog";
import { buildRankSlots, type PrizeRow } from "@/lib/games/slots";
import { suggestGames, type GameBlueprint } from "@/lib/games/suggest";
import type { BusinessProfile } from "@/lib/business/profile";
import type { GameConfig } from "@/lib/games/types";
import type { RewardTemplate } from "@/lib/types";
import type { SubscriptionTier } from "@/lib/constants";
import { GameLoop } from "@/components/games/game-loop";
import { GamePreview } from "./game-preview";
import { GameSections } from "./game-sections";

type Step = "pick" | "prize" | "done";

// How long a leaderboard runs before the prizes go out and it resets.
const SEASON_LENGTHS = [
  { value: 7, label: "Every week" },
  { value: 14, label: "Every two weeks" },
  { value: 30, label: "Every month" },
  { value: 1, label: "Every day" },
];

export function GameWizard({
  tier,
  brandColor,
  businessName,
  profile,
  rewardTemplates,
  onDone,
  onCancel,
  onCreateReward,
  onUpgrade,
  onSetUpPayouts,
}: {
  tier: SubscriptionTier;
  brandColor: string;
  businessName: string;
  profile: BusinessProfile;
  rewardTemplates: RewardTemplate[];
  onDone: () => void | Promise<void>;
  onCancel: () => void;
  onCreateReward?: () => void;
  /** Opens the Plans tab, for when the free plan's one game is already live. */
  onUpgrade?: () => void;
  /** Opens Settings → Getting paid, for when there's nowhere to send money. */
  onSetUpPayouts?: () => void;
}) {
  const [step, setStep] = useState<Step>("pick");
  // Which wall the save hit, when there's a one-tap way past it.
  const [blocked, setBlocked] = useState<"games" | "payouts" | null>(null);
  const [category, setCategory] = useState<GameCategory>("arcade");
  const [type, setType] = useState<GameType | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [config, setConfig] = useState<GameConfig>({});
  const [prizes, setPrizes] = useState<PrizeRow[]>([]);
  const [seasonDays, setSeasonDays] = useState(DEFAULT_SEASON_DAYS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const def: GameDefinition | null = type ? GAMES[type] : null;
  const maxPrizes = GAME_TIER_LIMITS[tier].maxPrizes;

  // Games written from what the business told us about itself.
  const tailored = useMemo(
    () =>
      profile.industry
        ? suggestGames({
            businessName,
            profile,
            rewards: rewardTemplates.map((r) => ({
              description: r.description,
              details: r.details,
              icon: r.icon,
              default_expiry_days: r.default_expiry_days,
            })),
          }).slice(0, 6)
        : [],
    [businessName, profile, rewardTemplates]
  );

  // Only competitive games can be created — the instant-win ones are retired.
  const gallery = useMemo(
    () =>
      competitiveCategories().map((c) => ({
        ...c,
        games: COMPETITIVE_GAMES.filter((g) => g.category === c.key),
      })),
    []
  );

  const startFromBlueprint = (blueprint: GameBlueprint) => {
    setType(blueprint.type);
    setTitle(blueprint.title);
    setDescription(blueprint.description);
    setConfig(blueprint.config);
    setPrizes(blueprint.prizes);
    setSeasonDays(DEFAULT_SEASON_DAYS);
    setStep("prize");
  };

  const startFromCatalogue = (chosen: GameDefinition) => {
    const first = rewardTemplates[0];
    const offer = (profile.offers ?? []).find((o) => o.trim().length > 0);
    setType(chosen.type);
    setTitle(`${chosen.label} at ${businessName}`.slice(0, 80));
    setDescription(chosen.tagline);
    setConfig({ ...chosen.defaultConfig });
    setSeasonDays(DEFAULT_SEASON_DAYS);
    setPrizes([
      {
        description: first?.description ?? offer ?? "10% off your next order",
        details: first?.details ?? "",
        icon: first?.icon ?? null,
        expiryDays: first?.default_expiry_days ?? 30,
        stock: 12,
        minScore: 0,
        awardRank: 1,
      },
    ]);
    setStep("prize");
  };

  const create = async () => {
    if (!def) return;
    const named = prizes.filter((p) => p.description.trim().length > 0);
    if (named.length === 0) {
      setError("Give first place something to win.");
      return;
    }

    setBusy(true);
    setError(null);
    // One prize per place: the order of the rows is the order of the podium.
    const slots = buildRankSlots(named);

    const res = await fetch("/api/merchant/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: def.type,
        title: title.trim() || def.label,
        description: description.trim(),
        config,
        prizes: slots,
        seasonDays,
      }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);

    if (!res.ok || !body?.ok) {
      setBlocked(
        body?.error === "too_many_games"
          ? "games"
          : body?.error === "no_payout_account"
            ? "payouts"
            : null
      );
      setError(
        body?.error === "too_many_games"
          ? "The free plan runs one game at a time, and yours is live. Pause it to swap this one in, or upgrade and run both."
          : body?.error === "no_payout_account"
            ? "Before a game can go live we need somewhere to send your money. Add your bank account and this goes straight up."
          : body?.error === "too_many_prizes"
            ? `You can put up to ${maxPrizes} prizes on a podium.`
            : "We couldn't create that game. Check the details and try again."
      );
      return;
    }

    setShareUrl(`${window.location.origin}${body.url}`);
    setStep("done");
  };

  // ---- Step 1: pick -------------------------------------------------------
  if (step === "pick") {
    return (
      <section className="mt-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-zinc-900">
              {tailored.length > 0
                ? "Pick one and it's yours"
                : "Pick a game to brand"}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {tailored.length > 0
                ? "Written for your business from what you told us. One more step after this."
                : "Everything comes pre-filled — you'll only confirm the prize."}
            </p>
          </div>
          <button onClick={onCancel} className="btn-secondary shrink-0">
            <X className="size-4" aria-hidden />
            Cancel
          </button>
        </header>

        {tailored.length > 0 ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tailored.map((blueprint) => {
                const blueprintDef = GAMES[blueprint.type];
                return (
                  <button
                    key={blueprint.type}
                    onClick={() => startFromBlueprint(blueprint)}
                    className="card group cursor-pointer p-4 text-left transition hover:-translate-y-1 hover:shadow-md"
                  >
                    <div className="flex items-center gap-2">
                      <GameLoop
                        type={blueprintDef.type}
                        icon={blueprintDef.icon}
                        swatch={blueprintDef.swatch}
                      />
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                        For you
                      </span>
                    </div>
                    <h3 className="mt-3 font-semibold text-zinc-900">
                      {blueprint.title}
                    </h3>
                    <p className="mt-1 text-sm text-zinc-500">{blueprint.why}</p>
                    <p className="mt-2 truncate text-xs font-medium text-zinc-400">
                      Prize: {blueprint.prizes[0]?.description ?? "—"}
                    </p>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <nav className="mt-4 flex flex-wrap gap-1 rounded-2xl border border-zinc-200 bg-white p-1">
              {gallery.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className={
                    "cursor-pointer rounded-xl px-3 py-1.5 text-sm font-medium transition " +
                    (category === c.key
                      ? "text-white"
                      : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800")
                  }
                  style={
                    category === c.key
                      ? { backgroundColor: "var(--brand)" }
                      : undefined
                  }
                >
                  {c.label}
                </button>
              ))}
            </nav>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {gallery
                .find((c) => c.key === category)!
                .games.map((game) => (
                  <button
                    key={game.type}
                    onClick={() => startFromCatalogue(game)}
                    className="card group cursor-pointer p-4 text-left transition hover:-translate-y-1 hover:shadow-md"
                  >
                    <GameLoop
                      type={game.type}
                      icon={game.icon}
                      swatch={game.swatch}
                    />
                    <h3 className="mt-3 font-semibold text-zinc-900">
                      {game.label}
                    </h3>
                    <p className="mt-0.5 text-sm text-zinc-500">{game.tagline}</p>
                  </button>
                ))}
            </div>
          </>
        )}
      </section>
    );
  }

  if (!def) return null;

  // ---- Done ---------------------------------------------------------------
  if (step === "done" && shareUrl) {
    return (
      <section className="mt-6">
        <div className="card mx-auto max-w-lg p-6 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <Check className="size-7" aria-hidden />
          </span>
          <h2 className="mt-4 text-xl font-bold text-zinc-900">{title} is live</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Share this link anywhere — WhatsApp status, Instagram bio, a QR code
            on the counter.
          </p>

          <div className="mt-5 flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2">
            <code className="min-w-0 flex-1 truncate px-2 text-left text-sm text-zinc-700">
              {shareUrl}
            </code>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(shareUrl);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }}
              className="btn-secondary text-sm"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary flex-1"
            >
              Open it
            </a>
            <button
              onClick={() => void onDone()}
              className="btn-primary flex-1"
              style={{ backgroundColor: "var(--brand)" }}
            >
              Back to my games
            </button>
          </div>

          <p className="mt-4 text-xs text-zinc-400">
            Want to change the questions, artwork or wording? Hit
            &ldquo;Edit&rdquo; on the game any time.
          </p>
        </div>
      </section>
    );
  }

  // ---- Step 2: prize & go live -------------------------------------------
  return (
    <section className="mt-6">
      <header className="flex items-start justify-between gap-3">
        <button onClick={() => setStep("pick")} className="btn-ghost">
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </button>
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Step 2 of 2
        </span>
        <button onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </header>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="order-2 lg:order-1">
          <div className="card p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <GameLoop type={def.type} icon={def.icon} swatch={def.swatch} />
              <div className="min-w-0">
                <h2 className="truncate font-bold text-zinc-900">{def.label}</h2>
                <p className="truncate text-sm text-zinc-500">{def.tagline}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-4">
              <GameSections
                def={def}
                title={title}
                description={description}
                config={config}
                prizes={prizes}
                rewards={rewardTemplates}
                onTitle={setTitle}
                onDescription={setDescription}
                onConfig={setConfig}
                onPrizes={setPrizes}
                onCreateReward={onCreateReward}
              />

              <label className="card block p-4">
                <span className="field-label">When do prizes go out?</span>
                <select
                  value={seasonDays}
                  onChange={(e) => setSeasonDays(Number(e.target.value))}
                  className="input-field"
                >
                  {SEASON_LENGTHS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-zinc-500">
                  The board resets each time, so everyone starts level again.
                </span>
              </label>

              <div className="rounded-xl bg-zinc-50 px-3 py-2.5 text-xs text-zinc-600">
                Players get{" "}
                <span className="font-semibold text-zinc-900">3 plays a week</span>{" "}
                across everything you run, and can earn a few more by sharing
                their link with someone who plays.
              </div>

              {error && (
                <div className="alert-error">
                  <p>{error}</p>
                  {blocked === "games" && onUpgrade && (
                    <button
                      onClick={onUpgrade}
                      className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 active:scale-[0.98]"
                    >
                      <Crown className="size-4" aria-hidden />
                      See Premium
                    </button>
                  )}
                  {blocked === "payouts" && onSetUpPayouts && (
                    <button
                      onClick={onSetUpPayouts}
                      className="btn-secondary mt-2 text-sm"
                    >
                      <Landmark className="size-4" aria-hidden />
                      Add your bank account
                    </button>
                  )}
                </div>
              )}

              <button
                onClick={create}
                disabled={busy}
                className="btn-primary"
                style={{ backgroundColor: "var(--brand)" }}
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Publishing…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" aria-hidden />
                    Publish &amp; get my link
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="order-1 lg:order-2 lg:sticky lg:top-6">
          <GamePreview
            def={def}
            config={config}
            prizes={prizes}
            accent={brandColor || "#059669"}
          />
        </div>
      </div>
    </section>
  );
}
