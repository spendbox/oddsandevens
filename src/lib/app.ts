/**
 * What this app is called.
 *
 * ## Onepad
 *
 * One pad. Everything you write goes on the same one — no folders, no
 * notebooks to choose between, no filing before you can start. That is the
 * whole design in the name, and it is the thing this app has that the ones
 * with a sidebar do not.
 *
 * It was "Pad" for a week, then "Jotter" for a while. Both were fine and
 * neither said the part that matters.
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
export const APP_NAME = 'Onepad'

/** The line under the name on an install prompt and in a search result. */
export const APP_TAGLINE = 'Notes for people who take notes for a living'
