/**
 * What this app is called.
 *
 * ## Jotter
 *
 * It had no name, only the word "Pad" left over from the first week, which
 * described a blank surface and nothing about what happens on it. A jotter
 * is the cheap notebook people actually carry: you jot in it, you do not
 * compose in it, and nobody is precious about a jotter — which is the whole
 * posture of this app. It says what it is in one plain English word, it is
 * a noun and a verb at once, and it is the same register as everything else
 * written here.
 *
 * ## Why it is a constant and not a string in fourteen files
 *
 * Because it was a string in fourteen files, and three of them still said
 * this was a place to build forms. A name ends up in the manifest, on the
 * install prompt, under the icon on a home screen, in the title of a shared
 * page and at the top of a stranger's sign-in — and it is exactly the kind
 * of thing somebody changes their mind about once. One import, one edit.
 *
 * The one place it cannot be imported is `public/sw.js`, which is served as
 * a plain file rather than compiled; the name appears there once, in the
 * sentence an offline browser shows.
 */
export const APP_NAME = 'Jotter'

/** The line under the name on an install prompt and in a search result. */
export const APP_TAGLINE = 'Notes for people who take notes for a living'
