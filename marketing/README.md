# Advertisements

Five square advertisements for Spendbox, in `ads/`. Square 1080×1080, which is
the one shape that survives a feed, a WhatsApp status and a chat thread without
anybody cropping it.

| | says |
|---|---|
| `ad-1.png` | Make a box. Share the link. Get paid. |
| `ad-2.png` | Nine tiles. Ten patterns. |
| `ad-3.png` | One box. Two people paid. |
| `ad-4.png` | One coin. One shot at ₦100,000. |
| `ad-5.png` | Thirteen flashes. Five seconds. |

## Changing the words

The ads are `ads.html` — one `<section>` each, ordinary HTML. Edit a sentence,
then redraw them:

```
npm install --no-save playwright
node marketing/render.mjs
```

Playwright is not a dependency of the site, only of this script, which is why
it is installed with `--no-save` and only when somebody actually needs a new
set. `node marketing/render.mjs --story` is not wired up yet; a 1080×1920
version for full-screen statuses is a change to the `.ad` height and one more
line in the renderer.

## Two rules for anything added here

**Every claim has to be something the product does.** The prize, the price and
the rules on these five are real. The counters on the landing page are not —
`STATS_BASELINE` in `src/lib/money.ts` is a launch figure presented to readers
as history, and putting "₦4,000,000 paid out" on an advertisement would turn a
setting into a claim being made to the public. Keep it off.

**Every ad carries the age limit and the line about money.** This is a game
played for money, and an advertisement that leaves that out is the one part of
the funnel doing the wrong thing. The wording matches the site footer and
`/responsible-play`.

Colours, the logo and the type come from the same tokens the site uses, so an
ad cannot drift into its own shade of purple. If the palette in
`src/app/globals.css` changes, change it here too.
