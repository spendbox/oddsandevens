// A business on a safe, drawn the same way everywhere.
//
// A sponsored box appears on six surfaces — the lobby card, the featured
// carousel, the resume strip, the rail on the play screen, the vault sheet, and
// the two endings — and the fastest way to make a sponsorship look cheap is to
// let each of those invent its own version of it. So there are three pieces
// here and every surface picks one:
//
//   SponsorChip   the lockup. Logo, and the words "Sponsored by". It is what
//                 goes on anything that is mostly about something else.
//   SponsorLine   one line: what the winner also gets, and who from. For the
//                 places already carrying a figure in gold, where the point is
//                 that the gold is not all of it.
//   SponsorPrize  the whole thing — the picture or the film, the name, the
//                 description. For the two surfaces that are *about* the
//                 reward: the vault sheet, and the moment somebody wins.
//
// **The colours are deliberate and they are not the money's.** Brass is what
// Spendbox pays; the sponsor's reward is grape, which is the palette's other
// prize colour and already the one that means "value that is not a transfer".
// A sponsor's own mark is left alone entirely — the plate under a logo is
// neutral, because a business's blue on our violet is their decision and
// tinting it is how a sponsorship starts looking like a fan edit.

import Image from "next/image";
import { Gift } from "lucide-react";
import type { Sponsor } from "@/lib/types";

/**
 * The logo, on a plate that guarantees it is visible.
 *
 * The plate is off-white and not optional. A logo arrives as whatever the
 * business had — a dark wordmark drawn for white paper as often as not — and
 * dropping one straight onto a violet-night background is how you get a
 * sponsor whose name is a smudge. `object-contain` because a logo is not a
 * photograph and cropping one is worse than leaving space around it.
 */
export function SponsorLogo({
  sponsor,
  className = "size-8",
}: {
  sponsor: Sponsor;
  className?: string;
}) {
  if (!sponsor.logoUrl) {
    // A business with no usable mark still gets a proper lockup rather than a
    // broken image frame: their initial, set the way the site sets everything.
    return (
      <span
        aria-hidden
        className={
          "flex shrink-0 items-center justify-center rounded-lg bg-white/90 font-black text-ink " +
          className
        }
      >
        {sponsor.name.slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    // `block` is load-bearing: a `span` is inline by default and an inline box
    // ignores width and height, so the plate would collapse to nothing the
    // first time one of these is used outside a flex container — which is the
    // only reason it works today.
    <span
      className={"relative block shrink-0 overflow-hidden rounded-lg bg-white/90 " + className}
    >
      <Image
        src={sponsor.logoUrl}
        alt={`${sponsor.name} logo`}
        fill
        // Never larger than about 64px anywhere it is used, and telling the
        // optimiser so is the difference between a 3KB thumbnail and the
        // original on every card in the lobby.
        sizes="64px"
        className="object-contain p-1"
      />
    </span>
  );
}

/**
 * "Sponsored by X", with their mark.
 *
 * Neutral on purpose. This goes on cards whose subject is the safe and the
 * money, and a sponsor badge that shouts over either of those is a badge an
 * admin ends up not using.
 */
export function SponsorChip({
  sponsor,
  className = "",
}: {
  sponsor: Sponsor;
  className?: string;
}) {
  return (
    <span
      className={
        "inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-white/12 bg-white/6 py-1 pl-1 pr-3 " +
        className
      }
    >
      <SponsorLogo sponsor={sponsor} className="size-6" />
      <span className="min-w-0 truncate text-[11px] font-bold leading-tight text-zinc-400">
        Sponsored by <span className="text-zinc-200">{sponsor.name}</span>
      </span>
    </span>
  );
}

/**
 * One line: and there is a thing as well as the money.
 *
 * For the surfaces already headed by a figure in gold. It names the prize
 * rather than gesturing at it — "plus something from Acme" is the sentence
 * that makes a reader assume it is a keyring.
 */
export function SponsorLine({
  sponsor,
  className = "",
}: {
  sponsor: Sponsor;
  className?: string;
}) {
  if (!sponsor.prize) return null;

  return (
    <span
      className={
        "inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-grape/15 py-1 pl-1 pr-3 text-grape " +
        className
      }
    >
      <SponsorLogo sponsor={sponsor} className="size-5" />
      <span className="min-w-0 truncate text-[11px] font-bold leading-tight">
        {/*
          "plus" carries the whole idea and it is one word: the money is not
          being replaced by this, it is being added to. Everywhere this appears,
          the figure it sits under is still true.
        */}
        plus <span className="font-black">{sponsor.prize.title}</span>
      </span>
    </span>
  );
}

/**
 * The one mark a card gets, chosen the same way on every card.
 *
 * There is room for exactly one line of this on a lobby card, a resume card or
 * a rail, and which line it should be depends on what the sponsor is actually
 * offering: name the reward when there is one, because that is the part that
 * changes whether somebody opens the box, and fall back to the lockup when the
 * sponsorship is a name on a safe. Leaving that choice to each surface is how
 * six surfaces end up making it four different ways.
 */
export function SponsorMark({
  sponsor,
  className = "",
}: {
  sponsor: Sponsor;
  className?: string;
}) {
  return sponsor.prize ? (
    <SponsorLine sponsor={sponsor} className={className} />
  ) : (
    <SponsorChip sponsor={sponsor} className={className} />
  );
}

/**
 * A full-width band, for the one card big enough to deserve one.
 *
 * The featured hero is the shop window and a chip on it reads as an
 * afterthought, so the sponsor gets its own row directly under the money —
 * touching it, because the whole claim is that the two go together.
 *
 * What it deliberately does *not* carry is the picture. A carousel on the front
 * page would mean loading a product still, or a film, for every slide before
 * anybody has chosen anything — on a game played on mobile data by people
 * already paying for lives. The full showcase is one tap away on the box's own
 * page, where somebody has asked.
 */
export function SponsorBand({ sponsor }: { sponsor: Sponsor }) {
  return (
    <div className="flex items-center gap-3">
      <SponsorLogo sponsor={sponsor} className="size-9" />
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-[10px] font-black uppercase tracking-[0.2em] text-grape">
          {sponsor.prize ? `Plus, from ${sponsor.name}` : `Sponsored by ${sponsor.name}`}
        </p>
        <p className="truncate text-sm font-black leading-tight">
          {sponsor.prize?.title ?? sponsor.name}
        </p>
      </div>
    </div>
  );
}

/**
 * The reward itself, at the size it deserves.
 *
 * Three bands, in the order somebody reads them: the thing, who it is from,
 * and what it is. The picture leads because a reward you can see is a
 * different proposition from a reward you are told about — which is the entire
 * reason an admin can upload one.
 *
 * The media slot is a fixed aspect ratio whether it holds a photograph, a film
 * or nothing at all. A panel that is a different height per box would make the
 * vault sheet jump as you open it and the carousel jump as you swipe it, and
 * an aspect box is also what stops the page reflowing when a slow image
 * finally lands.
 */
export function SponsorPrize({
  sponsor,
  /** Set on the surfaces where this has already been introduced. */
  heading = "Plus, from the sponsor",
  className = "",
}: {
  sponsor: Sponsor;
  heading?: string;
  className?: string;
}) {
  const prize = sponsor.prize;
  if (!prize) return null;

  return (
    <figure
      className={
        "overflow-hidden rounded-3xl border-2 border-grape/25 bg-grape/8 text-left " + className
      }
    >
      {prize.media ? (
        <div className="relative aspect-[16/10] w-full bg-black/40">
          {prize.media.kind === "image" ? (
            <Image
              src={prize.media.url}
              // The prize's own title is the description of the picture. There
              // is no better alt text available and none worth inventing.
              alt={prize.title}
              fill
              sizes="(max-width: 640px) 100vw, 640px"
              className="object-cover"
            />
          ) : (
            /*
              No autoplay, and `preload="metadata"` rather than `auto`.
              This is a game played on Nigerian mobile data by people who are
              already paying for lives; a reward film that starts itself and
              downloads in full behind a sheet somebody opened to check a
              number is a cost we would be imposing without asking. It plays
              when it is pressed.
            */
            <video
              src={prize.media.url}
              controls
              playsInline
              preload="metadata"
              className="size-full object-cover"
            />
          )}
        </div>
      ) : (
        /*
          Nothing uploaded. The panel keeps its proportions and says what it is
          rather than collapsing, because a sponsor who sent no photograph is
          still a sponsor giving somebody something.
        */
        <div className="flex aspect-[16/5] w-full items-center justify-center bg-gradient-to-br from-grape/25 to-transparent">
          <Gift className="size-10 text-grape/70" aria-hidden />
        </div>
      )}

      <figcaption className="p-4">
        <div className="flex items-center gap-2">
          <SponsorLogo sponsor={sponsor} className="size-7" />
          <p className="min-w-0 flex-1">
            <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-grape">
              {heading}
            </span>
            <span className="block truncate text-xs font-bold text-zinc-300">{sponsor.name}</span>
          </p>
        </div>

        <p className="mt-3 text-lg font-black leading-tight tracking-tight text-balance">
          {prize.title}
        </p>
        {prize.blurb && (
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{prize.blurb}</p>
        )}
      </figcaption>
    </figure>
  );
}
