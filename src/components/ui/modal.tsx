"use client";

// One dialog for the whole dashboard.
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

import { useCallback, useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export type ModalWidth = "sm" | "md" | "lg";

const WIDTHS: Record<ModalWidth, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
};

export function Modal({
  title,
  subtitle,
  icon,
  width = "md",
  footer,
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

  return (
    <div
      onClick={close}
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/50 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        className={
          // The panel is capped at the visible viewport and never taller, so
          // there is nothing to scroll the *page* for.
          "animate-pop-in flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[calc(100svh-2rem)] sm:rounded-3xl " +
          WIDTHS[width]
        }
      >
        {/* Grab handle — the thing that says "this sheet moves". */}
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-zinc-300" />
        </div>

        <header className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-4 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-900">
              {icon}
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="-mr-1.5 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-zinc-100 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
