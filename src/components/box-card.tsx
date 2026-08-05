import { Users } from "lucide-react";
import { SafeLink } from "@/components/safe-link";
import { rewardLabel } from "@/lib/game/rewards";
import { DifficultyBadge } from "@/components/difficulty-badge";
import { SafeArt } from "@/components/safe/safe-art";
import { ShareChip } from "@/components/share-safe";
import { plural } from "@/lib/plural";
import type { PublicBox } from "@/lib/types";

/**
 * One safe in the lobby. The reward is the headline because it is the point.
 *
 * The whole card is the link, but it is a *stretched* link rather than a
 * `<Link>` wrapping everything — a button inside an anchor is invalid, and the
 * share chip in the corner has to be a real button that doesn't navigate.
 */
export function BoxCard({ box, index = 0 }: { box: PublicBox; index?: number }) {
  const open = box.status === "unlocked";

  return (
    <div
      style={{ ["--i" as string]: index }}
      className={
        // `min-w-0`: a grid item's min-width is `auto`, so without it the
        // column cannot size below the card's min-content and the right-hand
        // edge is silently clipped away by the page's `overflow-x: clip`.
        "panel panel-lift animate-fade-up stagger group relative flex min-w-0 flex-col gap-3 rounded-3xl p-4 " +
        (open ? "opacity-70" : "")
      }
    >
      {/*
        Above the content, not below it. A stretched link underneath its own
        card catches nothing — every div over it is a hit target in its own
        right, so the tap lands on a paragraph and the card is dead. The share
        chip lifts itself back above this.
      */}
      <SafeLink slug={box.slug} title={box.title} className="absolute inset-0 z-20 rounded-3xl" />

      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/*
            One line each, clamped, and the description gets its slot whether
            or not there is one. A board where a two-word box is half the
            height of a wordy one reads as broken, and the full text is a tap
            away in the vault sheet once you're playing.
          */}
          <p className="truncate font-black tracking-tight">{box.title}</p>
          <p className="mt-0.5 truncate text-xs text-zinc-400">
            {box.kind === "general" ? "by Spendbox" : `by ${box.contributor}`}
          </p>
          <p className="mt-1 line-clamp-2 h-9 overflow-hidden text-xs leading-snug text-zinc-500">
            {box.blurb ?? ""}
          </p>
        </div>
        {/* The contributor's own safe. An opened box shows it swung — the card
            should read as spent before you get to the greyed-out figure
            underneath.

            `size-16` rather than something neater: below about 60px the dial
            and its knurling collapse into a smudge and every design reads as
            the same coloured blob, which is worse than no picture at all. */}
        <SafeArt
          design={box.design}
          mood={open ? "open" : "idle"}
          className="pointer-events-none size-16 shrink-0 transition group-hover:scale-110 group-hover:-rotate-3"
        />
      </div>

      {/*
        A cracked box keeps its figure in gold, captioned as *won*.
        Greying it out was reading as "there was nothing here" when the
        opposite is true: somebody was paid this, which is the single most
        persuasive thing on the whole wall and the reason the wall exists.
      */}
      <div className="relative z-10">
        <p
          className={
            // One size for both, so a challenge card is exactly as tall as a
            // money one. A board of cards that don't line up reads as broken
            // long before anybody works out why.
            "text-3xl font-black tabular-nums " +
            (box.isChallenge && !open ? "text-grape" : "brass-text")
          }
        >
          {rewardLabel(box.rewardKobo)}
        </p>
        {open && (
          <p className="mt-0.5 text-xs font-bold text-brass/80">
            {box.isChallenge ? "cracked" : "won"}
            {box.unlockedBy && <> by <span className="font-mono">{box.unlockedBy}</span></>}
          </p>
        )}
      </div>

      <div className="relative z-10">
        <DifficultyBadge difficulty={box.difficulty} />
      </div>

      <div className="relative z-10 mt-auto flex items-end justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <Users className="size-3" aria-hidden />
            {plural(box.playersCount, "hunter")}
          </span>
          <span>{plural(box.attemptsCount, "attempt")}</span>
        </div>

        {/* Sharing is a thing a *player* wants to do, not only an author: a
            board of safes is where somebody thinks of the friend who would
            enjoy one. */}
        <ShareChip slug={box.slug} title={box.title} className="relative z-30" />
      </div>
    </div>
  );
}
