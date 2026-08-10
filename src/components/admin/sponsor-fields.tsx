"use client";

// The form behind a sponsored box, in one place because it is asked for in two.
//
// A sponsorship is filled in when the safe is built and edited when the deal
// changes, and those are the same five questions on two different screens — the
// fifth card of the create form, and a dialog opened from the Boxes list. Two
// copies of a form with two file uploads in it is two copies of every rule
// about what a logo may be.
//
// The shape is the feature and the form says so out loud: a name, then
// optionally a prize, then optionally a picture of it. Clearing the name
// removes the sponsorship — that is stated on the field rather than left to be
// discovered, because "how do I take a business off a box whose deal ended" is
// otherwise a question with a frightening answer involving deleting the box.

import { useRef, useState } from "react";
import { Film, ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import {
  SPONSOR_IMAGE_MAX_BYTES,
  SPONSOR_IMAGE_TYPES,
  SPONSOR_NAME_MAX,
  SPONSOR_PRIZE_BLURB_MAX,
  SPONSOR_PRIZE_TITLE_MAX,
  SPONSOR_VIDEO_TYPES,
} from "@/lib/game/sponsors";

const INPUT = "field px-4 py-3";

/** The five answers, as the form holds them. Empty strings, never nulls. */
export interface SponsorDraft {
  name: string;
  logoUrl: string;
  prizeTitle: string;
  prizeBlurb: string;
  prizeMediaUrl: string;
  prizeMediaKind: "" | "image" | "video";
}

export const EMPTY_SPONSOR: SponsorDraft = {
  name: "",
  logoUrl: "",
  prizeTitle: "",
  prizeBlurb: "",
  prizeMediaUrl: "",
  prizeMediaKind: "",
};

/** What a route wants, from what the form holds. */
export function sponsorPayload(draft: SponsorDraft) {
  return {
    name: draft.name,
    logoUrl: draft.logoUrl,
    prizeTitle: draft.prizeTitle,
    prizeBlurb: draft.prizeBlurb,
    prizeMediaUrl: draft.prizeMediaUrl,
    prizeMediaKind: draft.prizeMediaKind,
  };
}

/** A one-line summary for the card that opens this. */
export function sponsorSummary(draft: SponsorDraft): string {
  if (!draft.name.trim()) return "Nobody — an ordinary box";
  if (!draft.prizeTitle.trim()) return `${draft.name.trim()} — name only`;
  return `${draft.name.trim()} — ${draft.prizeTitle.trim()}`;
}

export function SponsorFields({
  draft,
  onChange,
}: {
  draft: SponsorDraft;
  onChange: (next: SponsorDraft) => void;
}) {
  const set = <K extends keyof SponsorDraft>(key: K, value: SponsorDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const named = draft.name.trim().length > 0;

  return (
    <>
      <label className="block">
        <span className="text-sm font-bold text-zinc-300">The business</span>
        <input
          value={draft.name}
          maxLength={SPONSOR_NAME_MAX}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Leave empty for an ordinary box"
          className={`${INPUT} mt-1.5`}
        />
        <span className="mt-1 flex items-baseline justify-between gap-3 text-xs text-zinc-500">
          <span>
            Shown on every surface this box appears on. Emptying this removes
            the sponsorship entirely — the box keeps its history and its money.
          </span>
          <span className="shrink-0 text-zinc-400">
            {draft.name.length}/{SPONSOR_NAME_MAX}
          </span>
        </span>
      </label>

      <AssetField
        label="Their logo"
        hint="PNG, JPEG, WebP or GIF, up to 3MB. Square reads best. It sits on a white plate, so a logo drawn for paper is fine."
        accept={SPONSOR_IMAGE_TYPES.join(",")}
        url={draft.logoUrl}
        kind={draft.logoUrl ? "image" : ""}
        disabled={!named}
        onUploaded={(url) => set("logoUrl", url)}
        onClear={() => set("logoUrl", "")}
      />

      {/*
        Everything below is inside the prize, and the form says so by going
        quiet without a name above it. A sponsor with no prize is a real and
        common arrangement — a business paying to be on a safe we fund — so this
        is disabled rather than hidden: hiding it would make an admin think the
        feature was missing.
      */}
      <div className={named ? "" : "pointer-events-none opacity-40"}>
        <div className="mb-3 border-t border-white/10 pt-4">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-grape">
            What the winner also gets
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            On top of our money, not instead of it. Leave it blank to put the
            business on the box without a reward behind it.
          </p>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-bold text-zinc-300">The reward</span>
            <input
              value={draft.prizeTitle}
              maxLength={SPONSOR_PRIZE_TITLE_MAX}
              onChange={(e) => set("prizeTitle", e.target.value)}
              placeholder="A year of Acme Prime"
              className={`${INPUT} mt-1.5`}
            />
            <span className="mt-1 flex items-baseline justify-between gap-3 text-xs text-zinc-500">
              <span>Name the thing. &ldquo;A gift&rdquo; reads as a keyring.</span>
              <span className="shrink-0 text-zinc-400">
                {draft.prizeTitle.length}/{SPONSOR_PRIZE_TITLE_MAX}
              </span>
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-bold text-zinc-300">What it is</span>
            <textarea
              value={draft.prizeBlurb}
              maxLength={SPONSOR_PRIZE_BLURB_MAX}
              rows={3}
              onChange={(e) => set("prizeBlurb", e.target.value)}
              placeholder="Optional. How it is delivered, what it covers, anything a winner would ask."
              className={`${INPUT} mt-1.5 resize-none`}
            />
            <span className="mt-1 block text-right text-xs text-zinc-400">
              {draft.prizeBlurb.length}/{SPONSOR_PRIZE_BLURB_MAX}
            </span>
          </label>

          <AssetField
            label="A picture of it, or a film"
            hint="An image up to 3MB, or an MP4 or WebM up to 25MB. Shown at 16:10 and cropped to it, so keep the subject central. Video never plays on its own."
            accept={[...SPONSOR_IMAGE_TYPES, ...SPONSOR_VIDEO_TYPES].join(",")}
            url={draft.prizeMediaUrl}
            kind={draft.prizeMediaKind}
            disabled={!named || draft.prizeTitle.trim().length === 0}
            onUploaded={(url, kind) =>
              onChange({ ...draft, prizeMediaUrl: url, prizeMediaKind: kind })
            }
            onClear={() => onChange({ ...draft, prizeMediaUrl: "", prizeMediaKind: "" })}
          />
        </div>
      </div>
    </>
  );
}

/**
 * A file, uploaded the moment it is chosen.
 *
 * Not held back until the form is saved, and that is the point: an admin who
 * picks a logo wants to see the logo. Uploading on selection means the preview
 * below is the actual object at the actual URL that will be stored, so a file
 * that was the wrong one, the wrong shape or too large is discovered here
 * rather than on the front page.
 *
 * What it costs is orphans — a file uploaded and then abandoned by closing the
 * dialog stays in the bucket, unreferenced. That is the right trade at this
 * volume: these are a handful of images a month, and the alternative is either
 * a preview that lies or a sweep that could delete a live logo.
 */
function AssetField({
  label,
  hint,
  accept,
  url,
  kind,
  disabled,
  onUploaded,
  onClear,
}: {
  label: string;
  hint: string;
  accept: string;
  url: string;
  kind: "" | "image" | "video";
  disabled?: boolean;
  onUploaded: (url: string, kind: "image" | "video") => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);

    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/admin/sponsor/upload", { method: "POST", body });
    setBusy(false);

    // The field is cleared either way, so choosing the same file again after a
    // failure still fires a change event. Without this, a retry of the exact
    // file that just failed does nothing at all and looks like a dead button.
    if (input.current) input.current.value = "";

    if (res.ok) {
      const data = (await res.json()) as { url: string; kind: "image" | "video" };
      onUploaded(data.url, data.kind);
      return;
    }

    const problem = (await res.json().catch(() => ({}))) as { error?: string };
    setError(
      problem.error === "too_large"
        ? `That file is too big. Images up to ${Math.round(SPONSOR_IMAGE_MAX_BYTES / (1024 * 1024))}MB, video up to 25MB.`
        : problem.error === "unsupported_type"
          ? "That kind of file isn't allowed. PNG, JPEG, WebP, GIF, MP4 or WebM."
          : "The upload failed. Try again in a moment."
    );
  }

  return (
    <div>
      <span className="text-sm font-bold text-zinc-300">{label}</span>

      {url ? (
        <div className="mt-1.5 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-2">
          <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-white/90">
            {kind === "video" ? (
              // Muted and controlless: this is a thumbnail confirming which
              // file is attached, not a player. The real one is on the box.
              <video src={url} muted playsInline className="size-full object-cover" />
            ) : (
              <Image src={url} alt="" fill sizes="64px" className="object-contain p-1" />
            )}
          </span>
          <p className="min-w-0 flex-1 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5 font-bold text-zinc-200">
              {kind === "video" ? (
                <Film className="size-3.5" aria-hidden />
              ) : (
                <ImageIcon className="size-3.5" aria-hidden />
              )}
              {kind === "video" ? "Video attached" : "Image attached"}
            </span>
            <span className="mt-0.5 block break-all font-mono text-[10px] text-zinc-500">
              {url.split("/").pop()}
            </span>
          </p>
          <button
            type="button"
            onClick={onClear}
            aria-label={`Remove ${label}`}
            className="shrink-0 rounded-lg bg-berry/15 px-2 py-1.5 text-berry transition hover:bg-berry/25 active:translate-y-px"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => input.current?.click()}
          className={
            "mt-1.5 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/15 px-4 py-5 text-sm font-bold text-zinc-400 transition " +
            (disabled || busy
              ? "cursor-not-allowed opacity-50"
              : "hover:border-grape/50 hover:bg-grape/8 hover:text-grape active:translate-y-px")
          }
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="size-4" aria-hidden />
              Choose a file
            </>
          )}
        </button>
      )}

      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
      {error && (
        <p className="mt-1.5 rounded-xl bg-berry/15 px-3 py-2 text-xs font-bold text-berry">
          {error}
        </p>
      )}
    </div>
  );
}
