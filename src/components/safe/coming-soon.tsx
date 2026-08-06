"use client";

// The table, which does not exist yet.
//
// A safe is the one thing in this game several strangers are working on at the
// same time, and none of them can say a word to each other. That is a real
// absence: somebody four hundred guesses in has learned things about a password
// that nobody else knows, and the only way any of it reaches another player is
// through the scoreboard.
//
// So the button is here before the room is, and it says so plainly. A control
// that announces a date is a promise; this one shows the clock running down to
// it, which is the same promise with a cost attached — the countdown is
// checkable, and it gets shorter whether or not the work does.
//
// The date is a constant rather than "three months from now", and that matters:
// a relative deadline resets every time somebody opens the page, so it would
// read as three months away forever and never arrive.

import { useEffect, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Boxy } from "@/components/art/boxy";

/**
 * When the room opens. Three months from the day the button went in.
 *
 * Move it when the work moves, and move it *deliberately* — the whole value of
 * printing a countdown is that it is the same one for everybody and that it is
 * embarrassing to change.
 */
export const TABLE_OPENS = "2026-11-06T00:00:00Z";

export function ComingSoonDialog({ onClose }: { onClose: () => void }) {
  const left = useCountdown(TABLE_OPENS);

  return (
    <Modal
      title="The table"
      subtitle="Coming soon"
      icon={<MessagesSquare className="size-5 text-grape" aria-hidden />}
      width="sm"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky w-full rounded-2xl bg-brass px-4 py-3.5 text-ink"
        >
          Back to the hunt
        </button>
      }
    >
      <div className="space-y-4 pb-1 text-center">
        <Boxy mood="sly" className="mx-auto size-24 drop-shadow-2xl" />

        <p className="text-sm leading-relaxed text-zinc-300">
          Everyone hunting this safe, in one room, talking out loud — and
          anonymously, so what you say is a theory rather than a signature. No
          names, no history, nothing that follows you to the next box.
        </p>

        {/* The clock, which is the only part of this that isn't a claim. */}
        <div className="rounded-2xl border-2 border-grape/40 bg-grape/12 px-3 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-grape/80">
            Opens in
          </p>
          <p className="mt-1 flex items-baseline justify-center gap-2 font-black tabular-nums text-grape">
            <Unit value={left.days} label="days" />
            <Unit value={left.hours} label="hrs" />
            <Unit value={left.minutes} label="min" />
            <Unit value={left.seconds} label="sec" />
          </p>
        </div>

        <p className="text-xs leading-relaxed text-zinc-500">
          Nothing to sign up for. When it opens it will be on this screen, on
          this button.
        </p>
      </div>
    </Modal>
  );
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex flex-col items-center">
      <span className="text-2xl leading-none">{String(value).padStart(2, "0")}</span>
      <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-grape/70">
        {label}
      </span>
    </span>
  );
}

/**
 * Days, hours, minutes and seconds until a fixed instant.
 *
 * Seconds tick, so the number is visibly alive rather than a static figure that
 * could have been typed. Starts at zero on the server and fills in after mount
 * — the countdown depends on the reader's clock, and rendering it during SSR
 * would guarantee a hydration mismatch on every single load.
 */
function useCountdown(target: string) {
  const [left, setLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const read = () => {
      const ms = Math.max(0, new Date(target).getTime() - Date.now());
      const total = Math.floor(ms / 1000);
      setLeft({
        days: Math.floor(total / 86400),
        hours: Math.floor(total / 3600) % 24,
        minutes: Math.floor(total / 60) % 60,
        seconds: total % 60,
      });
    };
    read();
    const id = window.setInterval(read, 1000);
    return () => window.clearInterval(id);
  }, [target]);

  return left;
}
