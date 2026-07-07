"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Crown,
  Gift,
  ImagePlus,
  Plus,
  RefreshCw,
  Shapes,
  X,
} from "lucide-react";
import {
  GRID_RESET_DAYS_DEFAULT,
  GRID_SIZE,
  REWARD_EXPIRY_DAYS_DEFAULT,
  REWARD_EXPIRY_DAYS_MAX,
  REWARD_EXPIRY_DAYS_MIN,
  TIER_LIMITS,
  TILE_SHAPES,
  type SubscriptionTier,
  type TileShape,
} from "@/lib/constants";
import type { LibraryImage } from "@/lib/types";
import { curvedPathD, sharpClipPolygon, type TileEdges } from "@/lib/tile-shapes";
import type { RewardDraft } from "./shared";

const WIZARD_STEPS = ["Basics", "Look", "Rewards", "Review"] as const;

const SHAPE_LABELS: Record<TileShape, string> = {
  square: "Square",
  "interlock-sharp": "Interlock · sharp",
  "interlock-curved": "Interlock · curved",
};

// A fully interior tile (tabs on every edge) for the shape picker preview.
const PREVIEW_EDGES: TileEdges = {
  top: "out",
  right: "out",
  bottom: "out",
  left: "out",
};

function ShapePreview({ shape }: { shape: TileShape }) {
  if (shape === "square") {
    return <span className="block size-9 rounded-md bg-emerald-500" aria-hidden />;
  }
  const d =
    shape === "interlock-curved"
      ? curvedPathD(PREVIEW_EDGES)
      : // The polygon helper emits CSS syntax; strip it back to SVG points.
        undefined;
  return (
    <svg viewBox="0 0 1 1" className="size-9 text-emerald-500" aria-hidden>
      {shape === "interlock-curved" ? (
        <path d={d} fill="currentColor" />
      ) : (
        <polygon
          points={sharpClipPolygon(PREVIEW_EDGES)
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
}: {
  tier: SubscriptionTier;
  willReplaceActive: boolean;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const limits = TIER_LIMITS[tier];
  const isPremium = tier === "premium";

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [resetDays, setResetDays] = useState(GRID_RESET_DAYS_DEFAULT);
  const [tileShape, setTileShape] = useState<TileShape>("square");
  const [library, setLibrary] = useState<LibraryImage[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [customPreview, setCustomPreview] = useState<string | null>(null);
  const customImageRef = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<RewardDraft[]>([
    {
      description: "",
      expiryDays: REWARD_EXPIRY_DAYS_DEFAULT,
      maxRedemptions: 1,
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetch("/api/images")
      .then((res) => (res.ok ? res.json() : { images: [] }))
      .then((body) => {
        if (!ignore) setLibrary((body?.images as LibraryImage[]) ?? []);
      });
    return () => {
      ignore = true;
    };
  }, []);

  function setDraft(i: number, patch: Partial<RewardDraft>) {
    setDrafts((d) => d.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function validateStep(): string | null {
    if (step === 0) {
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
      if (drafts.some((d) => !d.description.trim())) {
        return "Every reward needs a description.";
      }
      const total = drafts.reduce((s, d) => s + d.maxRedemptions, 0);
      if (total > GRID_SIZE * GRID_SIZE) {
        return "More reward redemptions than tiles — reduce the winners.";
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
    const form = new FormData();
    form.set("title", title);
    form.set("tileShape", tileShape);
    form.set("resetDays", String(resetDays));
    form.set("rewards", JSON.stringify(drafts));
    const custom = customImageRef.current?.files?.[0];
    if (custom) form.set("image", custom);
    else if (imageUrl) form.set("imageUrl", imageUrl);

    const res = await fetch("/api/merchant/grid", { method: "POST", body: form });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        {
          too_many_rewards: `Your ${tier} tier allows up to ${limits.maxRewards} rewards.`,
          too_many_active_grids: `You already have the maximum number of active grids — archive one first.`,
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
        }[String(body?.error)] ?? "Couldn't create the grid."
      );
      return;
    }
    await onDone();
  }

  const totalRewardTiles = drafts.reduce((s, d) => s + d.maxRedemptions, 0);

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
          codes stay valid). Go Premium to run up to 10 grids at once.
        </p>
      )}

      {/* Step 1: basics */}
      {step === 0 && (
        <div className="mt-5 max-w-md space-y-4">
          <label className="block">
            <span className="field-label">Grid name (customers see this)</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="July jollof hunt"
              className="input-field"
            />
          </label>
          <p className="text-xs text-zinc-500">
            Every grid is {GRID_SIZE}×{GRID_SIZE} — {GRID_SIZE * GRID_SIZE}{" "}
            tiles.
          </p>
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
              Each revealed tile uncovers a piece of this image.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setImageUrl(null);
                  setCustomPreview(null);
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
                    setCustomPreview(URL.createObjectURL(f));
                    setImageUrl(null);
                  }
                }}
              />
            </div>
            {library.length === 0 && (
              <p className="mt-2 text-xs text-zinc-400">
                No free images in the library yet
                {isPremium ? " — upload your own." : "."}
              </p>
            )}
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

      {/* Step 3: rewards */}
      {step === 2 && (
        <div className="mt-5">
          <span className="field-label">
            Rewards ({drafts.length}/{limits.maxRewards})
          </span>
          {drafts.map((d, i) => (
            <div key={i} className="mt-2 flex flex-wrap items-end gap-2">
              <label className="block grow">
                <span className="field-label">Description</span>
                <input
                  required
                  value={d.description}
                  onChange={(e) => setDraft(i, { description: e.target.value })}
                  placeholder="Free plate of jollof rice"
                  className="input-field"
                />
              </label>
              <label className="block">
                <span className="field-label">Valid for (days)</span>
                <input
                  type="number"
                  min={REWARD_EXPIRY_DAYS_MIN}
                  max={REWARD_EXPIRY_DAYS_MAX}
                  value={d.expiryDays}
                  onChange={(e) =>
                    setDraft(i, { expiryDays: Number(e.target.value) })
                  }
                  className="input-field w-24"
                />
              </label>
              <label className="block">
                <span className="field-label">Winners</span>
                <input
                  type="number"
                  min={1}
                  max={49}
                  value={d.maxRedemptions}
                  onChange={(e) =>
                    setDraft(i, { maxRedemptions: Number(e.target.value) })
                  }
                  className="input-field w-20"
                />
              </label>
              {drafts.length > 1 && (
                <button
                  type="button"
                  onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}
                  className="btn-secondary px-3 py-2.5 text-sm text-rose-500"
                  aria-label="Remove reward"
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
          ))}
          {drafts.length < limits.maxRewards && (
            <button
              type="button"
              onClick={() =>
                setDrafts((ds) => [
                  ...ds,
                  {
                    description: "",
                    expiryDays: REWARD_EXPIRY_DAYS_DEFAULT,
                    maxRedemptions: 1,
                  },
                ])
              }
              className="btn-secondary mt-3 px-3 py-1.5 text-sm"
            >
              <Plus className="size-4" aria-hidden />
              Add reward
            </button>
          )}
        </div>
      )}

      {/* Step 4: review */}
      {step === 3 && (
        <div className="mt-5 max-w-md">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Name</dt>
              <dd className="font-medium text-zinc-900">
                {title || `${GRID_SIZE}×${GRID_SIZE} grid`}
              </dd>
            </div>
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
                {drafts.map((d, i) => (
                  <span key={i} className="block">
                    {d.description} ({d.maxRedemptions}x, {d.expiryDays}d)
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
