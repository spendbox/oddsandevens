"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Crown,
  Gift,
  ImagePlus,
  RefreshCw,
  Shapes,
  X,
} from "lucide-react";
import {
  GRID_RESET_DAYS_DEFAULT,
  GRID_SIZE,
  TIER_LIMITS,
  TILE_SHAPES,
  type SubscriptionTier,
  type TileShape,
} from "@/lib/constants";
import { rewardIcon } from "@/lib/reward-icons";
import type { LibraryImage, RewardTemplate } from "@/lib/types";
import {
  allEdgeCombos,
  chevronClipPolygon,
  curvedPathD,
  edgesFor,
  edgesKey,
  interlockSliceStyle,
  isOutTile,
  sharpClipPolygon,
  usesSvgClip,
  type TileEdges,
} from "@/lib/tile-shapes";

const WIZARD_STEPS = ["Basics", "Look", "Rewards", "Review"] as const;

const SHAPE_LABELS: Record<TileShape, string> = {
  square: "Square",
  "interlock-sharp": "Interlock · sharp",
  "interlock-curved": "Interlock · curved",
  "interlock-round": "Interlock · round",
  "interlock-chevron": "Interlock · chevron",
};

// A fully interior tile (tabs on every edge) for the shape picker preview.
const PREVIEW_EDGES: TileEdges = {
  top: "out",
  right: "out",
  bottom: "out",
  left: "out",
};

// Deterministic pseudo-random cell picker so the preview stays stable
// between renders (real reward positions are chosen server-side).
function sampleCells(count: number, salt: number): Set<number> {
  const cells = new Set<number>();
  let i = salt;
  while (cells.size < Math.min(count, GRID_SIZE * GRID_SIZE)) {
    cells.add((i * 19 + 7) % (GRID_SIZE * GRID_SIZE));
    i += 1;
  }
  return cells;
}

// Live preview of the grid being built: updates with every wizard choice.
function GridPreview({
  title,
  tileShape,
  imageUrl,
  rewardTiles,
}: {
  title: string;
  tileShape: TileShape;
  imageUrl: string | null;
  rewardTiles: number;
}) {
  const interlock = tileShape !== "square";
  const rewardCells = sampleCells(rewardTiles, 3);
  // A few tiles shown "revealed" so the puzzle-image effect is visible.
  const revealedCells = imageUrl ? sampleCells(10, 11) : new Set<number>();

  const curvedCombos = usesSvgClip(tileShape)
    ? allEdgeCombos(GRID_SIZE, GRID_SIZE)
    : [];

  function clipStyle(row: number, col: number): React.CSSProperties {
    if (!interlock) return {};
    const edges = edgesFor(row, col, GRID_SIZE, GRID_SIZE);
    if (tileShape === "interlock-sharp") {
      return { clipPath: sharpClipPolygon(edges) };
    }
    if (tileShape === "interlock-chevron") {
      return { clipPath: chevronClipPolygon(edges) };
    }
    return { clipPath: `url(#wizprev-${edgesKey(edges)})` };
  }

  return (
    <div className="card p-4">
      <p className="section-title">Live preview</p>
      {curvedCombos.length > 0 && (
        <svg width="0" height="0" className="absolute" aria-hidden>
          <defs>
            {curvedCombos.map((edges) => (
              <clipPath
                key={edgesKey(edges)}
                id={`wizprev-${edgesKey(edges)}`}
                clipPathUnits="objectBoundingBox"
              >
                <path d={curvedPathD(edges, tileShape)} />
              </clipPath>
            ))}
          </defs>
        </svg>
      )}
      <div
        className={
          "mx-auto mt-3 grid w-full max-w-72 " +
          (interlock ? "gap-0" : "gap-1")
        }
        style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}
        aria-hidden
      >
        {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
          const row = Math.floor(i / GRID_SIZE);
          const col = i % GRID_SIZE;
          const revealed = revealedCells.has(i);
          const reward = rewardCells.has(i);

          // Reversed image: unrevealed tiles show the picture; the sampled
          // "revealed" tiles show a faded brand-colour patch instead.
          const imageSlice: React.CSSProperties = imageUrl
            ? interlock
              ? interlockSliceStyle(row, col, GRID_SIZE, GRID_SIZE, imageUrl)
              : {
                  backgroundImage: `url(${imageUrl})`,
                  backgroundSize: `${GRID_SIZE * 100}% ${GRID_SIZE * 100}%`,
                  backgroundPosition: `${(col / (GRID_SIZE - 1)) * 100}% ${(row / (GRID_SIZE - 1)) * 100}%`,
                }
            : {};

          let fillStyle: React.CSSProperties = {};
          let tileClass = "";
          if (imageUrl) {
            fillStyle = revealed
              ? {
                  backgroundColor:
                    "color-mix(in oklab, var(--brand), transparent 82%)",
                }
              : imageSlice;
          } else {
            tileClass = "tile-live";
          }

          if (!interlock) {
            return (
              <div key={i} className={`relative aspect-square rounded ${tileClass}`} style={fillStyle}>
                {reward && (
                  <Gift className="absolute inset-0 m-auto size-3 text-white/90" aria-hidden />
                )}
              </div>
            );
          }
          return (
            <div
              key={i}
              className="tile-shaped relative aspect-square"
              style={{ zIndex: isOutTile(row, col) ? 2 : 1 }}
            >
              <div
                className={`absolute ${tileClass}`}
                style={{
                  inset: "-22%",
                  ...clipStyle(row, col),
                  ...fillStyle,
                }}
              />
              {reward && (
                <Gift className="absolute inset-0 z-10 m-auto size-3 text-white/90" aria-hidden />
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 truncate text-center text-sm font-medium text-zinc-800">
        {title || "Untitled grid"}
      </p>
    </div>
  );
}

function ShapePreview({ shape }: { shape: TileShape }) {
  if (shape === "square") {
    return <span className="block size-9 rounded-md bg-emerald-500" aria-hidden />;
  }
  // Curved family draws an SVG path; sharp family a polygon (CSS syntax stripped
  // back to SVG points).
  const isCurved = shape === "interlock-curved" || shape === "interlock-round";
  return (
    <svg viewBox="0 0 1 1" className="size-9 text-emerald-500" aria-hidden>
      {isCurved ? (
        <path d={curvedPathD(PREVIEW_EDGES, shape)} fill="currentColor" />
      ) : (
        <polygon
          points={(shape === "interlock-chevron"
            ? chevronClipPolygon(PREVIEW_EDGES)
            : sharpClipPolygon(PREVIEW_EDGES)
          )
            .replace(/^polygon\(/, "")
            .replace(/\)$/, "")
            .split(", ")
            .map((pt) =>
              pt
                .split(" ")
                .map((v) => Number(v.replace("%", "")) / 100)
                .join(",")
            )
            .join(" ")}
          fill="currentColor"
        />
      )}
    </svg>
  );
}

export function GridWizard({
  tier,
  willReplaceActive,
  onDone,
  onCancel,
  onManageRewards,
}: {
  tier: SubscriptionTier;
  willReplaceActive: boolean;
  onDone: () => Promise<void>;
  onCancel: () => void;
  onManageRewards: () => void;
}) {
  const limits = TIER_LIMITS[tier];
  const isPremium = tier === "premium";

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [resetDays, setResetDays] = useState(GRID_RESET_DAYS_DEFAULT);
  const [tileShape, setTileShape] = useState<TileShape>("square");
  const [library, setLibrary] = useState<LibraryImage[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [customPreview, setCustomPreview] = useState<string | null>(null);
  // The chosen custom file lives in state, NOT just in the <input> — the
  // input is unmounted when the wizard leaves the Look step, which used to
  // silently drop the upload at submit time.
  const [customFile, setCustomFile] = useState<File | null>(null);
  const customImageRef = useRef<HTMLInputElement>(null);
  // Rewards come from the merchant's catalogue; the grid only records which
  // ones to hide and how many winners each gets on this board.
  const [templates, setTemplates] = useState<RewardTemplate[] | null>(null);
  const [winners, setWinners] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetch("/api/images")
      .then((res) => (res.ok ? res.json() : { images: [] }))
      .then((body) => {
        if (!ignore) setLibrary((body?.images as LibraryImage[]) ?? []);
      });
    fetch("/api/merchant/reward-templates")
      .then((res) => (res.ok ? res.json() : { rewards: [] }))
      .then((body) => {
        if (!ignore) setTemplates((body?.rewards as RewardTemplate[]) ?? []);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const selectedIds = Object.keys(winners);

  function toggleReward(id: string) {
    setWinners((w) => {
      if (id in w) {
        const next = { ...w };
        delete next[id];
        return next;
      }
      return { ...w, [id]: 1 };
    });
  }

  function setWinnerCount(id: string, n: number) {
    setWinners((w) => ({ ...w, [id]: n }));
  }

  function validateStep(): string | null {
    if (step === 0) {
      if (!title.trim()) {
        return "Give your grid a name — customers see it on your board.";
      }
      if (
        !Number.isInteger(resetDays) ||
        resetDays < limits.resetDaysMin ||
        resetDays > limits.resetDaysMax
      ) {
        return isPremium
          ? `Reset cooldown must be between ${limits.resetDaysMin} and ${limits.resetDaysMax} days.`
          : "Reset cooldown is fixed at 7 days on the free tier.";
      }
    }
    if (step === 2) {
      if (selectedIds.length === 0) {
        return "Pick at least one reward to hide in this grid.";
      }
      if (selectedIds.length > limits.maxRewards) {
        return `Your ${tier} tier allows up to ${limits.maxRewards} rewards per grid.`;
      }
      if (selectedIds.some((id) => !Number.isInteger(winners[id]) || winners[id] < 1)) {
        return "Each reward needs at least one winner.";
      }
      const total = selectedIds.reduce((s, id) => s + winners[id], 0);
      if (total > GRID_SIZE * GRID_SIZE) {
        return "More winning tiles than tiles on the grid — reduce the winners.";
      }
    }
    return null;
  }

  function next() {
    const v = validateStep();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const chosen = (templates ?? []).filter((t) => t.id in winners);
    const drafts = chosen.map((t) => ({
      description: t.description,
      details: t.details ?? "",
      icon: t.icon ?? "",
      expiryDays: t.default_expiry_days,
      maxRedemptions: winners[t.id],
    }));
    const form = new FormData();
    form.set("title", title.trim());
    if (description.trim()) form.set("description", description.trim());
    form.set("tileShape", tileShape);
    form.set("resetDays", String(resetDays));
    form.set("rewards", JSON.stringify(drafts));
    if (customFile) form.set("image", customFile);
    else if (imageUrl) form.set("imageUrl", imageUrl);

    const res = await fetch("/api/merchant/grid", { method: "POST", body: form });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        {
          title_required: "Give your grid a name — customers see it on your board.",
          too_many_rewards: `Your ${tier} tier allows up to ${limits.maxRewards} rewards.`,
          too_many_active_grids: `You already have the maximum number of active grids — archive one first, or go Premium for unlimited grids.`,
          invalid_reward: "Each reward needs a description and sensible numbers.",
          rewards_exceed_tiles:
            "More reward redemptions than tiles — reduce the winners.",
          no_rewards: "Add at least one reward.",
          shape_requires_premium: "Interlocking tile shapes are a Premium feature.",
          invalid_reset_days: isPremium
            ? "Reset cooldown must be 7-365 days."
            : "Reset cooldown is fixed at 7 days on the free tier.",
          custom_image_requires_premium: "Custom images are a Premium feature.",
          invalid_image: "Pick an image from the library.",
          invalid_image_type: "Image must be PNG, JPEG, or WebP.",
          image_too_large: "Image must be under 3 MB.",
          image_upload_failed:
            "Couldn't upload your image — try again, or use a smaller file.",
          invalid_tile_shape:
            "That tile shape isn't available yet — your database may need the latest migrations (supabase/migrations, incl. 0012).",
          internal:
            "Something went wrong on the server while creating the grid — try again in a moment.",
        }[String(body?.error)] ?? "Couldn't create the grid."
      );
      return;
    }
    await onDone();
  }

  const totalRewardTiles = selectedIds.reduce((s, id) => s + winners[id], 0);
  const chosenTemplates = (templates ?? []).filter((t) => t.id in winners);

  return (
    <section className="card mt-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-900">
          <Gift className="size-5 text-emerald-600" aria-hidden />
          New grid
        </h2>
        <button onClick={onCancel} className="btn-ghost" aria-label="Cancel">
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {/* Step indicator */}
      <ol className="mt-4 flex items-center gap-2">
        {WIZARD_STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={
                "flex size-6 items-center justify-center rounded-full text-xs font-semibold " +
                (i < step
                  ? "bg-emerald-600 text-white"
                  : i === step
                    ? "bg-emerald-100 text-emerald-700 ring-2 ring-emerald-600"
                    : "bg-zinc-100 text-zinc-400")
              }
            >
              {i < step ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span
              className={
                "text-xs font-medium " +
                (i === step ? "text-zinc-900" : "text-zinc-400")
              }
            >
              {label}
            </span>
            {i < WIZARD_STEPS.length - 1 && (
              <span className="h-px w-4 bg-zinc-200 sm:w-8" aria-hidden />
            )}
          </li>
        ))}
      </ol>

      {willReplaceActive && step === 0 && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          On the free tier a new grid replaces your current one (already-issued
          codes stay valid). Go Premium to run unlimited grids at once.
        </p>
      )}

      <div className="gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
      {/* Step 1: basics */}
      {step === 0 && (
        <div className="mt-5 max-w-md space-y-4">
          <label className="block">
            <span className="field-label">Grid name (required — customers see this)</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              required
              placeholder="July jollof hunt"
              className="input-field"
            />
          </label>
          <label className="block">
            <span className="field-label">Description (optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="What is this grid about? e.g. the product it features, or what customers can win…"
              className="input-field resize-none"
            />
          </label>
          <label className="block">
            <span className="field-label flex items-center gap-1.5">
              <RefreshCw className="size-3.5" aria-hidden />
              Reset cooldown (days) {!isPremium && "· fixed on free"}
            </span>
            <input
              type="number"
              min={limits.resetDaysMin}
              max={limits.resetDaysMax}
              value={resetDays}
              disabled={!isPremium}
              onChange={(e) => setResetDays(Number(e.target.value))}
              className="input-field w-28"
            />
            <p className="mt-1 text-[11px] text-zinc-400">
              Once every reward is found, the grid rests this long, then
              resets with fresh stock.{" "}
              {isPremium ? "7-365 days." : "Free tier: 7 days."}
            </p>
          </label>
        </div>
      )}

      {/* Step 2: look */}
      {step === 1 && (
        <div className="mt-5 space-y-5">
          <div>
            <span className="field-label">Puzzle image (optional)</span>
            <p className="text-xs text-zinc-500">
              Your board shows this image; each tile a customer taps covers a
              piece of it with your brand colour.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setImageUrl(null);
                  setCustomPreview(null);
                  setCustomFile(null);
                  if (customImageRef.current) customImageRef.current.value = "";
                }}
                className={
                  "flex size-20 items-center justify-center rounded-lg border-2 text-xs " +
                  (!imageUrl && !customPreview
                    ? "border-emerald-600 text-emerald-700"
                    : "border-zinc-200 text-zinc-400 hover:border-zinc-300")
                }
              >
                None
              </button>
              {library.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  title={img.title}
                  onClick={() => {
                    setImageUrl(img.url);
                    setCustomPreview(null);
                    setCustomFile(null);
                    if (customImageRef.current) customImageRef.current.value = "";
                  }}
                  className={
                    "size-20 overflow-hidden rounded-lg border-2 " +
                    (imageUrl === img.url
                      ? "border-emerald-600"
                      : "border-zinc-200 hover:border-zinc-300")
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- library image host not known at build time */}
                  <img src={img.url} alt={img.title} className="size-full object-cover" />
                </button>
              ))}
              <button
                type="button"
                onClick={() =>
                  isPremium ? customImageRef.current?.click() : undefined
                }
                disabled={!isPremium}
                title={
                  isPremium ? "Upload your own image" : "Custom images are Premium"
                }
                className={
                  "relative flex size-20 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed " +
                  (customPreview
                    ? "border-emerald-600"
                    : isPremium
                      ? "border-zinc-300 text-zinc-400 hover:border-emerald-500 hover:text-emerald-600"
                      : "cursor-not-allowed border-zinc-200 text-zinc-300")
                }
              >
                {customPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                  <img src={customPreview} alt="Custom" className="size-full object-cover" />
                ) : (
                  <ImagePlus className="size-6" aria-hidden />
                )}
                {!isPremium && (
                  <Crown className="absolute right-1 top-1 size-3.5 text-amber-500" aria-hidden />
                )}
              </button>
              <input
                ref={customImageRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setCustomFile(f);
                    setCustomPreview(URL.createObjectURL(f));
                    setImageUrl(null);
                  }
                }}
              />
            </div>
          </div>

          <div>
            <span className="field-label flex items-center gap-1.5">
              <Shapes className="size-3.5" aria-hidden />
              Tile shape {!isPremium && "(Premium)"}
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {TILE_SHAPES.map((shape) => {
                const locked = shape !== "square" && !isPremium;
                return (
                  <button
                    key={shape}
                    type="button"
                    disabled={locked}
                    onClick={() => setTileShape(shape)}
                    className={
                      "relative flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 text-xs " +
                      (tileShape === shape
                        ? "border-emerald-600 text-emerald-700"
                        : locked
                          ? "cursor-not-allowed border-zinc-200 text-zinc-300"
                          : "border-zinc-200 text-zinc-500 hover:border-zinc-300")
                    }
                  >
                    <ShapePreview shape={shape} />
                    {SHAPE_LABELS[shape]}
                    {locked && (
                      <Crown className="absolute right-1 top-1 size-3.5 text-amber-500" aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-400">
              Interlocking tiles mesh into each other like a jigsaw.
            </p>
          </div>
        </div>
      )}

      {/* Step 3: rewards — pick from the merchant's catalogue */}
      {step === 2 && (
        <div className="mt-5">
          <span className="field-label">
            Choose rewards ({selectedIds.length}/{limits.maxRewards})
          </span>
          <p className="text-xs text-zinc-500">
            Pick which of your rewards to hide in this grid and how many winning
            tiles each gets. The rest of the tiles earn loyalty points.
          </p>

          {templates === null ? (
            <p className="mt-4 animate-pulse text-sm text-zinc-400">
              Loading your rewards…
            </p>
          ) : templates.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-zinc-200 p-6 text-center">
              <Gift className="mx-auto size-8 text-zinc-300" aria-hidden />
              <p className="mt-3 text-sm text-zinc-500">
                You haven&apos;t created any rewards yet. Add one in the Rewards
                tab, then come back to build your grid.
              </p>
              <button
                type="button"
                onClick={onManageRewards}
                className="btn-primary mt-4 px-4 py-2 text-sm"
              >
                <Gift className="size-4" aria-hidden />
                Manage rewards
              </button>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {templates.map((t) => {
                const selected = t.id in winners;
                return (
                  <li
                    key={t.id}
                    className={
                      "rounded-xl border p-3 transition " +
                      (selected
                        ? "border-emerald-500 bg-emerald-50/40"
                        : "border-zinc-200")
                    }
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex min-w-0 cursor-pointer items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleReward(t.id)}
                          className="mt-1 size-4 accent-emerald-600"
                        />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-900">
                            {(() => {
                              const Icon = rewardIcon(t.icon);
                              return (
                                <Icon
                                  className="size-4 shrink-0 text-emerald-600"
                                  aria-hidden
                                />
                              );
                            })()}
                            {t.description}
                          </span>
                          <span className="block text-xs text-zinc-500">
                            Valid {t.default_expiry_days} day
                            {t.default_expiry_days === 1 ? "" : "s"}
                            {t.details ? ` · ${t.details}` : ""}
                          </span>
                        </span>
                      </label>
                      {selected && (
                        <label className="flex items-center gap-1.5 text-xs text-zinc-600">
                          Winners
                          <input
                            type="number"
                            min={1}
                            max={GRID_SIZE * GRID_SIZE}
                            value={winners[t.id]}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) =>
                              setWinnerCount(t.id, Number(e.target.value))
                            }
                            className="input-field w-20"
                          />
                        </label>
                      )}
                    </div>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  onClick={onManageRewards}
                  className="btn-secondary mt-1 px-3 py-1.5 text-sm"
                >
                  <Gift className="size-4" aria-hidden />
                  Manage rewards
                </button>
              </li>
            </ul>
          )}
        </div>
      )}

      {/* Step 4: review */}
      {step === 3 && (
        <div className="mt-5 max-w-md">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Name</dt>
              <dd className="font-medium text-zinc-900">{title}</dd>
            </div>
            {description.trim() && (
              <div className="flex justify-between gap-4">
                <dt className="text-zinc-500">Description</dt>
                <dd className="max-w-[60%] text-right font-medium text-zinc-900">
                  {description.trim()}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Size</dt>
              <dd className="font-medium text-zinc-900">
                {GRID_SIZE}×{GRID_SIZE} ({GRID_SIZE * GRID_SIZE} tiles)
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Tile shape</dt>
              <dd className="font-medium text-zinc-900">
                {SHAPE_LABELS[tileShape]}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Reset cooldown</dt>
              <dd className="font-medium text-zinc-900">{resetDays} days</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Puzzle image</dt>
              <dd className="font-medium text-zinc-900">
                {customPreview ? "Custom upload" : imageUrl ? "From library" : "None"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Rewards</dt>
              <dd className="text-right font-medium text-zinc-900">
                {chosenTemplates.map((t) => (
                  <span key={t.id} className="block">
                    {t.description} ({winners[t.id]}x, {t.default_expiry_days}d)
                  </span>
                ))}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Winning tiles</dt>
              <dd className="font-medium text-zinc-900">
                {totalRewardTiles} of {GRID_SIZE * GRID_SIZE}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-zinc-400">
            Rewards are hidden on random tiles server-side — nobody (including
            you) can predict them, and they reshuffle after every redemption.
          </p>
        </div>
      )}
        </div>

        <aside className="mt-6 lg:mt-5">
          <GridPreview
            title={title}
            tileShape={tileShape}
            imageUrl={customPreview ?? imageUrl}
            rewardTiles={totalRewardTiles}
          />
        </aside>
      </div>

      {error && <p className="alert-error mt-4">{error}</p>}

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => (step === 0 ? onCancel() : setStep((s) => s - 1))}
          className="btn-secondary"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {step === 0 ? "Cancel" : "Back"}
        </button>
        {step < WIZARD_STEPS.length - 1 ? (
          <button type="button" onClick={next} className="btn-primary">
            Next
            <ArrowRight className="size-4" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="btn-primary"
          >
            {busy ? "Building…" : "Create grid"}
          </button>
        )}
      </div>
    </section>
  );
}
