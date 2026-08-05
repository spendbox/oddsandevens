"use client";

// One dialog for the whole game.
//
// Every popup here used to be hand-rolled, and every one of them was wrong on
// a phone in the same way: sized in `vh`, which on mobile Safari and Chrome
// counts the space behind the browser's own chrome, so an "85vh" panel is
// taller than the screen it sits on. The header scrolled away with the body,
// so the close button went with it. The page behind kept scrolling. The result
// was a dialog you had to scroll to escape from.
//
// This one is built the other way round: the panel can never exceed the
// visible viewport (`svh`, the *small* viewport — the one that assumes the
// browser chrome is showing), the header and footer are pinned, and only the
// middle scrolls. On a phone it arrives as a sheet from the bottom, where a
// thumb is; from `sm` up it is a centred card.
//
// Two things it stopped doing. It was a white card, which in a violet-night
// game reads as a different application opening on top of this one — it is cut
// from `sheet` now and inherits the site's colours. And it was sized for a
// desktop first: an 18px title, 24px of padding and a 36px icon, all of which
// a 360px phone pays for twice over. Every one of those steps down on small
// screens, so the *content* is what fills a sheet rather than the frame
// around it.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Portal } from "./portal";

/** Drag this far down and letting go closes it. */
const DISMISS_PX = 110;

/**
 * Swipe a sheet away.
 *
 * A sheet that arrives from the bottom edge of a phone has exactly one gesture
 * everybody already knows, and not honouring it makes the grab handle a lie.
 *
 * The whole sheet is draggable, not just the handle — but only from the top of
 * its scroll. Reading down a long attempt log and flicking back up must scroll,
 * not dismiss, so the drag only engages when the body is already at
 * `scrollTop <= 0` and the finger is moving down. Once engaged it takes over,
 * which is why the listener is non-passive and added by hand: `preventDefault`
 * is the only thing that stops the browser deciding this was a scroll after
 * all, and React's synthetic handlers can't be made non-passive.
 */
function useSwipeAway(onClose: () => void) {
  const sheet = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(0);

  useEffect(() => {
    const el = sheet.current;
    if (!el) return;

    let startY = 0;
    let active = false;
    let armed = false;

    const start = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      startY = event.touches[0].clientY;
      // Armed, not engaged: the direction isn't known until the finger moves.
      armed = (body.current?.scrollTop ?? 0) <= 0;
      active = false;
    };

    const move = (event: TouchEvent) => {
      if (!armed || event.touches.length !== 1) return;
      const dy = event.touches[0].clientY - startY;
      if (!active) {
        if (dy < 6) return;
        active = true;
      }
      if (dy <= 0) {
        setDrag(0);
        return;
      }
      event.preventDefault();
      // Rubber-banded: the first hundred pixels track the finger and the rest
      // give, so a long drag never detaches the sheet from the thumb.
      setDrag(dy > DISMISS_PX ? DISMISS_PX + (dy - DISMISS_PX) * 0.35 : dy);
    };

    const end = () => {
      armed = false;
      if (!active) return;
      active = false;
      setDrag((current) => {
        if (current >= DISMISS_PX) onClose();
        return 0;
      });
    };

    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [onClose]);

  return [sheet, body, drag] as const;
}

export type ModalWidth = "sm" | "md" | "lg";

const WIDTHS: Record<ModalWidth, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
};

/**
 * How much of the viewport an on-screen keyboard is covering.
 *
 * The reason a dialog's action button ends up behind the keys: on a phone the
 * keyboard is drawn *over* the page rather than shrinking it, so `svh` and
 * `dvh` both still describe the whole screen and a footer pinned to the bottom
 * of a 90svh sheet is pinned underneath the keyboard. `visualViewport` is the
 * only thing that knows the difference — its height is what you can actually
 * see — and the gap between that and the layout viewport is the inset.
 *
 * Zero on a desktop, and zero on Android once `interactive-widget=
 * resizes-content` has done the job, so applying it is always safe.
 */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const read = () => {
      // `offsetTop` matters: iOS scrolls the visual viewport as well as
      // shrinking it, and without it the sheet jumps by however far it slid.
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      setInset(covered > 24 ? covered : 0);
    };
    read();
    // And again shortly after, twice.
    //
    // A sheet that opens *while* a keyboard is retracting — the out-of-lives
    // one, arriving on the guess that failed — mounts into a viewport that is
    // mid-animation, and the `resize` events that describe the rest of that
    // animation may already have fired before this listener existed. Without
    // these the dialog keeps whichever inset it happened to catch, which is
    // either a gap under it or the whole sheet still tucked behind the keys.
    const settles = [250, 700].map((ms) => window.setTimeout(read, ms));

    vv.addEventListener("resize", read);
    vv.addEventListener("scroll", read);
    return () => {
      settles.forEach(window.clearTimeout);
      vv.removeEventListener("resize", read);
      vv.removeEventListener("scroll", read);
    };
  }, []);

  return inset;
}

export function Modal({
  title,
  subtitle,
  icon,
  width = "md",
  footer,
  /**
   * Sits *outside* the sheet, on its top edge.
   *
   * For things that belong to the dialog but not to its scroll — a mascot on
   * the lip of it. Nothing here is interactive, so nothing here needs to
   * survive the sheet scrolling away from it.
   */
  above,
  onClose,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Sits to the left of the title. */
  icon?: ReactNode;
  width?: ModalWidth;
  /** Pinned to the bottom, above the safe area. Actions belong here. */
  footer?: ReactNode;
  above?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  /**
   * Closes on the next tick rather than inside the click that asked for it.
   *
   * Taking the dialog out of the DOM mid-dispatch makes Chrome fire a second
   * click at whatever is now under the pointer — often the button that opened
   * it, so it shut and reopened in one tap. Leaving it mounted for the rest of
   * the dispatch costs a frame and nothing else.
   */
  const close = useCallback(() => {
    window.setTimeout(onClose, 0);
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const keyboard = useKeyboardInset();
  const [sheetRef, bodyRef, drag] = useSwipeAway(close);

  return (
    <Portal>
      <div
        onClick={close}
        // The keyboard's height is padding on the backdrop rather than a
        // transform on the sheet, so the sheet's own max-height shrinks with it
        // and a long dialog scrolls instead of being pushed off the top.
        style={keyboard > 0 ? { paddingBottom: keyboard } : undefined}
        className="fixed inset-0 z-50 flex max-h-[100svh] items-end justify-center bg-background-deep/75 backdrop-blur-sm transition-[padding] duration-150 sm:items-center sm:p-4"
      >
        {/*
          The column that holds the sheet and whatever sits above it.
          `max-h-full` and `min-h-0` are both load-bearing: without the cap the
          column is as tall as its content, so the sheet's own `max-h-full`
          resolves against nothing and a long dialog grows straight off the top
          of the screen — which is exactly what happened to the explainer, and
          you were left looking at its last paragraph with no way to scroll up.
        */}
        <div
          onClick={(event) => event.stopPropagation()}
          className={"flex max-h-full min-h-0 w-full min-w-0 flex-col justify-end " + WIDTHS[width]}
        >
          {above && <div className="shrink-0">{above}</div>}

          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            style={
              drag > 0
                ? { transform: `translateY(${drag}px)`, transition: "none" }
                : { transition: "transform 0.22s cubic-bezier(0.22,1,0.36,1)" }
            }
            className="sheet animate-pop-in flex min-h-0 w-full flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl"
          >
          {/* Grab handle — the thing that says "this sheet moves". */}
          <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
            <span className="h-1 w-10 rounded-full bg-white/25" />
          </div>

          <header className="flex shrink-0 items-start justify-between gap-2 px-4 pb-2.5 pt-3 sm:gap-3 sm:px-6 sm:pb-3 sm:pt-5">
            <div className="flex min-w-0 items-start gap-2 sm:gap-2.5">
              {/* The icon shrinks on a phone rather than being hidden: it is
                  the only thing telling you which dialog this is at a glance. */}
              {icon && (
                <span className="mt-0.5 shrink-0 [&>*]:size-7 sm:[&>*]:size-9">{icon}</span>
              )}
              <div className="min-w-0">
                <h2 className="text-balance text-base font-black leading-snug tracking-tight sm:text-lg">
                  {title}
                </h2>
                {subtitle && (
                  <p className="mt-0.5 break-words text-xs text-zinc-400 sm:text-sm">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="-mr-1 -mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-foreground"
            >
              <X className="size-5" aria-hidden />
            </button>
          </header>

          <div
            ref={bodyRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6 sm:pb-5"
          >
            {children}
          </div>

            {footer && (
              <div className="shrink-0 border-t border-white/10 bg-black/20 px-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-4">
                {footer}
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
