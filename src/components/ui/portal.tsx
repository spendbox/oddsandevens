"use client";

// Renders its children at the end of <body>, outside whatever is around it.
//
// This is not tidiness — it is the only way a dialog can trust `position:
// fixed`. An ancestor with a transform, a filter, a backdrop-filter, `contain`
// or `will-change` becomes the *containing block* for fixed descendants, so
// `fixed inset-0` stops meaning "the viewport" and starts meaning "that
// element". The dashboard is wrapped in `animate-fade-up`, whose fill-mode is
// `both`, so its `translateY(0)` never goes away — every dialog inside it was
// being positioned against a page-height box and appearing at the top of the
// document. If you had scrolled down, you had to scroll back up to find it.
//
// Portalling to <body> removes the whole class of bug rather than the one
// instance of it, and it keeps working when someone adds an animation to a
// wrapper years from now.

import { createPortal } from "react-dom";

export function Portal({ children }: { children: React.ReactNode }) {
  // Dialogs only mount from an interaction, so `document` is there by the time
  // this runs. The guard is for the caller who one day renders one open on the
  // first paint.
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
