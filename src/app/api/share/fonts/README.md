# Poster fonts

Two subsets of **Liberation Sans**, used only by the share-kit image routes.

## Why they exist at all

`ImageResponse` renders with Satori, whose bundled default font is Geist — and
Geist has no **U+20A6 NAIRA SIGN**. Every `₦` on a generated poster came out as
a tofu box, on the largest element of the artwork, on a product priced entirely
in naira. That is not a thing a fallback fixes; the glyph has to be supplied.

## Why they are subsetted

The originals are ~400KB each. These carry only what a poster can contain:
printable ASCII, Latin-1 Supplement and Latin Extended-A (accents in a business
name), the curly quotes and dashes that come out of typed copy, every symbol in
the game's own alphabet, and the currency signs. That is 50KB each, small
enough to sit in the repo and be read from disk per render.

Regenerate with `fontTools.subset` if the alphabet in `src/lib/constants.ts`
ever gains characters — a glyph that is not in here renders as a box.

## Licence

Liberation Sans is SIL OFL 1.1 (see `LICENSE.txt`), which permits bundling and
modification. The OFL reserves the name, so these derivatives are renamed
internally to "Spendbox Poster" rather than shipping as "Liberation".
