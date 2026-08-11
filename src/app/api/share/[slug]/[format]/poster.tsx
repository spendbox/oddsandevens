import type { ReactElement } from "react";
import { rewardLabel } from "@/lib/game/rewards";
import type { ShareFormat, ShareFormatSpec } from "@/lib/game/share-kit";
import type { Sponsor } from "@/lib/types";

/**
 * The poster itself, as a function of plain data.
 *
 * Deliberately separate from the route that serves it, and the reason is that
 * a picture is the one thing in this codebase you cannot check by reading it.
 * Split this way it can be rendered from a script with invented data — a
 * sponsor with a seven-figure reward, a sponsor with no logo, a challenge box
 * with a very long title — and the results looked at, without a database and
 * without deploying anything. Every layout bug in here was found that way.
 *
 * **Satori is not a browser.** It renders flexbox and a subset of CSS: no
 * grid, no radial gradients, no `text-overflow`, and **every element with more
 * than one child must say `display: flex` out loud**. The verbosity below is
 * that rule, not an oversight.
 */

const INK = "#17102e";
const INK_DEEP = "#100a20";
const BRASS = "#ffc247";
const GRAPE = "#b57bff";
const PAPER = "#fdf7ff";

export interface PosterData {
  title: string;
  rewardKobo: number;
  sponsor: Sponsor | null;
}

/**
 * Roughly how wide a string is, in ems of Liberation Sans Bold.
 *
 * Satori will not wrap, shrink or ellipsise a single line to make it fit — it
 * draws text at the size it is told and lets it run off the canvas, silently,
 * producing a poster that is wrong in a way no error ever mentions. So the one
 * line that must never wrap (the money) has its size computed from how wide it
 * actually is, and this is the measurement that makes that possible.
 *
 * The numbers are the font's own advance widths, and they were checked against
 * rendered output rather than guessed: at these ratios "₦250,000" and
 * "₦10,000,000" land within 2% of where the estimate says they will.
 */
function emWidth(text: string): number {
  let em = 0;
  for (const ch of text) {
    if (ch >= "0" && ch <= "9") em += 0.573;
    else if (ch === "," || ch === "." || ch === " ") em += 0.3;
    else if (ch === "₦") em += 0.573;
    else if (ch >= "A" && ch <= "Z") em += 0.68;
    else em += 0.56;
  }
  return em;
}

/** The largest size at which `text` fits `available` pixels on one line. */
function fitSize(text: string, max: number, available: number): number {
  // 0.95 rather than 1: the estimate above is close but not exact, and the
  // cost of being 3% optimistic is a naira sign hanging off the edge of
  // somebody's Instagram post.
  return Math.min(max, Math.floor((available * 0.95) / emWidth(text)));
}

export function poster(
  data: PosterData,
  format: ShareFormat,
  spec: ShareFormatSpec
): ReactElement {
  // Every measurement is written at wide-crop scale and multiplied. One design
  // in three crops rather than three designs that drift apart.
  const s = (n: number) => Math.round(n * spec.scale);

  const { title, rewardKobo, sponsor } = data;
  const challenge = rewardKobo <= 0;
  const figure = challenge ? "A pure challenge" : rewardLabel(rewardKobo);

  /*
   * The footer stacks on everything but the wide crop.
   *
   * It used to stack only on the story, on the reasoning that the square is
   * "not tall". But the square is no wider than the story — 1080 both — and
   * the call-to-action pill at square scale is nearly the full width of it, so
   * the row arrangement drove the pill straight through "spendbox.site". Width
   * is what decides this, and only the wide crop has any to spare.
   */
  const stacked = format !== "wide";

  /*
   * How much room there is between the paddings. Not a constant: the story is
   * taller than the square but exactly as wide, so scaling type by `spec.scale`
   * alone overflowed it every time.
   */
  const inner = spec.width - s(60) * 2;

  const figureSize = fitSize(figure, s(challenge ? 86 : 150), inner);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: INK,
        // Satori has no radial-gradient. A linear one off the corner reads the
        // same at poster size and renders identically everywhere.
        backgroundImage: `linear-gradient(135deg, ${INK_DEEP} 0%, ${INK} 45%, #241a4d 100%)`,
        padding: `${s(56)}px ${s(60)}px`,
        fontFamily: "Spendbox Poster",
      }}
    >
      {/* ---- who is behind it -------------------------------------------- */}
      <div style={{ display: "flex", alignItems: "center" }}>
        {sponsor?.logoUrl && (
          /*
            Satori fetches this at render time, from our own storage. The name
            beside it is deliberately not conditional on the logo: a business
            with no usable square mark still gets its name set properly.
          */
          /*
            Not `next/image`, and the lint rule does not apply here: this JSX is
            never mounted in a browser. Satori reads it to draw a PNG, and it
            understands `img` and nothing else — a Next `<Image>` would render
            as an unknown element and disappear from the poster.
          */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sponsor.logoUrl}
            width={s(66)}
            height={s(66)}
            style={{
              borderRadius: s(14),
              backgroundColor: PAPER,
              objectFit: "contain",
              marginRight: s(18),
            }}
            alt=""
          />
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontSize: s(18),
              letterSpacing: s(3),
              color: sponsor ? GRAPE : "#9083b8",
              fontWeight: 700,
            }}
          >
            {sponsor ? "BROUGHT TO YOU BY" : "A SPENDBOX SAFE"}
          </span>
          {sponsor && (
            <span style={{ fontSize: s(34), color: PAPER, fontWeight: 800 }}>
              {sponsor.name}
            </span>
          )}
        </div>
      </div>

      {/* ---- the hook ----------------------------------------------------- */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: s(29), color: "#c9bfe4", fontWeight: 600 }}>
          Guess the password. Open the safe.
        </span>

        <span
          style={{
            // Already in final pixels: fitSize() takes a scaled maximum, so putting
            // s() round it again multiplied the figure by the crop scale twice.
            fontSize: figureSize,
            lineHeight: 1,
            marginTop: s(12),
            color: challenge ? GRAPE : BRASS,
            fontWeight: 900,
          }}
        >
          {figure}
        </span>

        {/*
          Wraps rather than shrinking. A long box name set across two lines
          reads better than the same name set small, and unlike the figure it
          has no reason to stay on one. `maxWidth` is what makes that possible
          at all: Satori wraps inside a constrained box and overflows one that
          is free to grow.
        */}
        <span
          style={{
            fontSize: s(37),
            marginTop: s(16),
            color: PAPER,
            fontWeight: 800,
            maxWidth: inner,
            lineHeight: 1.2,
          }}
        >
          {title}
        </span>

        {/* The one line on this poster that is about the sponsor rather than
            about us: what they are adding to the money. */}
        {sponsor?.prize && (
          <div
            style={{
              display: "flex",
              marginTop: s(24),
              paddingTop: s(18),
              paddingBottom: s(18),
              paddingLeft: s(26),
              paddingRight: s(26),
              borderRadius: s(20),
              backgroundColor: "rgba(181,123,255,0.16)",
              // Bounded, so a 60-character reward wraps inside the strip
              // instead of stretching it off the side of the poster.
              maxWidth: inner,
            }}
          >
            <span
              style={{ fontSize: s(27), color: GRAPE, fontWeight: 800, lineHeight: 1.3 }}
            >
              {`Plus ${sponsor.prize.title}`}
            </span>
          </div>
        )}
      </div>

      {/* ---- what to do about it ------------------------------------------ */}
      <div
        style={{
          display: "flex",
          flexDirection: stacked ? "column" : "row",
          alignItems: stacked ? "flex-start" : "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            paddingTop: s(17),
            paddingBottom: s(17),
            paddingLeft: s(32),
            paddingRight: s(32),
            borderRadius: s(999),
            backgroundColor: BRASS,
            marginBottom: stacked ? s(18) : 0,
          }}
        >
          <span style={{ fontSize: s(26), color: INK, fontWeight: 900 }}>
            Play free — 7 lives, one back every hour
          </span>
        </div>
        <span style={{ fontSize: s(25), color: "#8d81b3", fontWeight: 700 }}>
          spendbox.site
        </span>
      </div>
    </div>
  );
}
