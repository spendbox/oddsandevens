"use client";

// The boxes an admin has put at the top of the page.
//
// Editorial, not structural. The front page used to be "ours above, everyone
// else's below", which is a strange thing to hard-code when every box plays
// identically and a worse thing to explain. Now somebody picks the ones worth
// arriving to, whoever made them.
//
// It swipes. More than one featured box on a phone is a carousel or it is
// nothing, and the native way to build one is `scroll-snap` — no library, no
// drag handlers, no fighting the browser for the scroll. Arrows appear only
// where there is a pointer to use them.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { DifficultyBadge } from "@/components/difficulty-badge";
import { ShareChip } from "@/components/share-safe";
import { SafeArt } from "@/components/safe/safe-art";
import { DESIGN_SPECS } from "@/lib/game/designs";
import { rewardLabel } from "@/lib/game/rewards";
import { compact } from "@/lib/plural";
import type { PublicBox } from "@/lib/types";

export function Featured({ boxes }: { boxes: PublicBox[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  // Which card is centred, worked out from the scroll position rather than
  // tracked separately — a swipe, an arrow and a dot all move the same number.
  //
  // Measured against the cards themselves rather than by dividing the scroll
  // offset by the track width. The gap between cards means those two numbers
  // drift apart a little further with every slide, so by the fourth box the
  // dots were lighting up one behind the card you were looking at.
  const onScroll = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const middle = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestGap = Infinity;
    [...el.children].forEach((child, i) => {
      const card = child as HTMLElement;
      const gap = Math.abs(card.offsetLeft + card.offsetWidth / 2 - middle);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    });
    setIndex(best);
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  function go(to: number) {
    const el = track.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(el.children.length - 1, to));
    const card = el.children[clamped] as HTMLElement | undefined;
    if (!card) return;
    el.scrollTo({
      left: card.offsetLeft + card.offsetWidth / 2 - el.clientWidth / 2,
      behavior: "smooth",
    });
  }

  if (boxes.length === 0) return null;

  return (
    <section className="relative">
      {/*
        The padding is not decoration. A horizontal scroll container clips
        vertically too — `overflow-y: visible` is not a thing next to
        `overflow-x: auto` — so the card's hover lift, its glow and its focus
        ring were all being sliced off along the top edge. The padding gives
        them somewhere to go and the matching negative margin gives the space
        back to the layout, which keeps each card exactly as wide as the
        section that holds it.
      */}
      <div
        ref={track}
        className="-mx-3 -my-3 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {boxes.map((box) => (
          <div
            key={box.slug}
            /*
              Not quite the full width, so the card either side shows through.
              A full-bleed slide is indistinguishable from a static hero until
              somebody happens to drag it — the peek is the only thing on the
              page that says there is more than one of these. A lone featured
              box takes the whole width, because there is nothing to peek at.
            */
            className={
              "shrink-0 snap-center " + (boxes.length > 1 ? "w-[88%] sm:w-[92%]" : "w-full")
            }
          >
            <FeaturedCard box={box} />
          </div>
        ))}
      </div>

      {boxes.length > 1 && (
        <>
          {/* Arrows, for a mouse. A touch device gets the swipe it expects. */}
          <Arrow side="left" disabled={index === 0} onClick={() => go(index - 1)} />
          <Arrow
            side="right"
            disabled={index >= boxes.length - 1}
            onClick={() => go(index + 1)}
          />

          <div className="mt-4 flex justify-center gap-2">
            {boxes.map((box, i) => (
              <button
                key={box.slug}
                type="button"
                aria-label={`Show ${box.title}`}
                aria-current={i === index}
                onClick={() => go(i)}
                className={
                  "h-2 rounded-full transition-all " +
                  (i === index ? "w-7 bg-brass" : "w-2 bg-white/25 hover:bg-white/50")
                }
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * One featured box, as big as it deserves.
 *
 * It was a two-column card with everything stacked at the same rhythm — kicker,
 * title, blurb, reward, difficulty, counters, link — eight things four pixels
 * apart, which is why it read as cramped *and* as boring at the same time.
 * Nothing was louder than anything else, so nothing led.
 *
 * It has three bands now, separated by hairlines and generous space:
 *
 *   who and what   the maker, the name, and the description.
 *   the prize      alone in the middle band, on a lit plate. It is the reason
 *                  the card exists and it is now the only thing in its row.
 *   the terms      how hard it is on one side, who's already on it on the
 *                  other — pushed apart rather than stacked four pixels apart.
 *
 * The description gets a fixed two-line slot whether or not there is one, so
 * every slide in the carousel is exactly as tall as every other and swiping
 * doesn't make the page jump.
 */
function FeaturedCard({ box }: { box: PublicBox }) {
  const spec = DESIGN_SPECS[box.design];

  return (
    /*
      A stretched link rather than an anchor round everything: the share chip
      has to be a real button, and a button inside an anchor is invalid — and
      in practice means one tap doing both things.
    */
    <div className="panel panel-lift group relative flex flex-col overflow-hidden rounded-3xl">
      {/*
        `z-20`, above the content — not below it.
        A stretched link underneath its own card catches nothing: every div
        over it is a hit target in its own right, so the tap lands on a
        paragraph and the card is dead. Everything decorative is
        `pointer-events-none`, and the one real control on the card lifts
        itself back above this with `z-30`.
      */}
      <Link
        href={`/b/${box.slug}`}
        aria-label={box.title}
        className="absolute inset-0 z-20 rounded-3xl"
      />

      {/* A wash in the safe's own colour, so swiping from one featured box to
          the next doesn't feel like the same card twice with the words swapped.
          Inline rather than a class because the colour comes from the design. */}
      <div
        aria-hidden
        style={{ background: spec.body[0] }}
        className="pointer-events-none absolute -left-20 -top-24 size-72 rounded-full opacity-20 blur-3xl"
      />

      {/* ---- who and what ---------------------------------------------- */}
      <div className="relative z-10 p-4 sm:p-7">
      <div className="flex items-start gap-3 sm:gap-5">
        <div className="relative shrink-0">
          {/* A pedestal under the safe. Without it the art floats on the
              gradient and the whole card reads as flat. */}
          <div
            aria-hidden
            style={{ background: spec.body[0] }}
            className="pointer-events-none absolute inset-x-0 bottom-1 mx-auto h-3 w-4/5 rounded-full opacity-40 blur-md"
          />
          <SafeArt
            design={box.design}
            className="pointer-events-none relative size-24 drop-shadow-2xl transition duration-300 group-hover:scale-105 group-hover:-rotate-3 sm:size-32"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-black uppercase tracking-[0.2em] text-brass">
            {box.kind === "general" ? "By Spendbox" : `By ${box.contributor}`}
          </p>

          {/* Two lines' worth of room whether the name needs them or not.
              A carousel whose slides are different heights makes the page jump
              under your thumb as you swipe. */}
          <h3 className="mt-1.5 line-clamp-2 min-h-[3.125rem] text-xl font-black leading-tight tracking-tight sm:min-h-[3.75rem] sm:text-2xl">
            {box.title}
          </h3>
        </div>
      </div>

      {/*
        The description, across the whole card rather than in the narrow column
        beside the safe — at 320px that column is about twenty characters wide,
        which turned a hundred and twenty of them into six lines and then
        clipped four. Full width it is three, and the full width is also what
        lets it sit directly under the name it belongs to.

        A fixed slot, filled or not: reserving the space is what keeps one
        slide from being taller than the next.
      */}
      <p className="mt-2 line-clamp-3 h-[3.6rem] overflow-hidden text-sm leading-snug text-zinc-400">
        {box.blurb ?? ""}
      </p>
      </div>

      {/* ---- the prize -------------------------------------------------- */}
      <div className="relative z-10 border-y border-white/10 bg-black/25 px-4 py-4 text-center sm:px-7 sm:py-5">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-500">
          {/* Both short enough to stay on one line at 320px. A two-line
              kicker on one card and a one-line kicker on the next is fifteen
              pixels of difference in a carousel that has to be uniform. */}
          {box.isChallenge ? "A pure challenge" : "Crack it, it's yours"}
        </p>
        <p
          className={
            // Stepped at 360px as well as at `sm`, because a seven-figure
            // reward at `text-5xl` runs into both edges of a 320px screen. The
            // same steps for a challenge, in grape — the band has to be the
            // same height whichever kind of box is in it.
            "mt-1 text-4xl font-black leading-none tabular-nums min-[360px]:text-5xl sm:text-6xl " +
            (box.isChallenge ? "text-grape" : "brass-text")
          }
        >
          {rewardLabel(box.rewardKobo)}
        </p>
      </div>

      {/* ---- the terms -------------------------------------------------- */}
      {/*
        Stacked on a phone, one row from `sm`. Deliberately *not* `flex-wrap`:
        wrapping is decided per card, so a "Merciless" badge pushed its
        counters onto a second line while a "Warm" one didn't — and two slides
        of different heights make the carousel jump under your thumb.
      */}
      <div className="relative z-10 flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <DifficultyBadge difficulty={box.difficulty} />
        {/*
          Pushed to the far side rather than sitting two pixels under the
          badge. They answer different questions — how hard, and how busy —
          and putting them on opposite ends is what says so.
        */}
        <div className="flex items-stretch gap-2">
          <Counter label="Hunters" value={box.playersCount} />
          <Counter label="Attempts" value={box.attemptsCount} />
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3.5 sm:px-7">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-brass">
          Take a crack at it
          <ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden />
        </span>
        <ShareChip slug={box.slug} title={box.title} className="relative z-30" />
      </div>
    </div>
  );
}

/** A count that survives being large. */
function Counter({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex min-w-16 flex-col items-center rounded-xl bg-black/25 px-2.5 py-1">
      <span className="font-mono text-sm font-black leading-tight tabular-nums">
        {compact(value)}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
    </span>
  );
}

function Arrow({
  side,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={side === "left" ? "Previous" : "Next"}
      className={
        "absolute top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/15 bg-background/85 backdrop-blur transition hover:border-brass/60 disabled:opacity-0 sm:flex " +
        (side === "left" ? "-left-4" : "-right-4")
      }
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
