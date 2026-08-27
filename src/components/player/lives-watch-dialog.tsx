"use client";

// The offer to be told when the pool is full again.
//
// It appears at one moment and only one: somebody has run out of lives, has
// looked at what buying more costs, and has closed that dialog without buying.
// They have chosen to wait — so the only useful thing left to say is "we'll
// tell you when the wait is over", and it is the one thing the product can
// offer them that costs nobody anything.
//
// **Why this is a pop-up and not a line in the buy dialog.** A free
// alternative sitting beside three prices is an argument against all three,
// and this one is genuinely better for the player who has already decided not
// to pay. Standing on its own, after that decision, it competes with nothing.
//
// It is asked once, ever. A permission refusal is permanent in a way nothing
// else in a product is — there is no second browser prompt and no way for a
// site to undo one — so a dismissal here is remembered forever and the switch
// in /me is the way back.

import { useState } from "react";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Boxy } from "@/components/art/boxy";
import { HeartArt } from "./lives-badge";
import { enablePush, pushEnabled, pushPermission, pushSupport } from "@/lib/push-client";
import { usePlayer } from "./player-context";

const DISMISSED = "spendbox_lives_push_dismissed";

type Phase = "offer" | "busy" | "done" | "refused";

/**
 * Whether there is anything to offer, asked of the browser rather than React.
 *
 * "Inactive" is three different states and only two of them are worth a
 * dialog. A browser that has never been asked is the one this is for. A
 * browser that granted permission but holds no subscription — data cleared, a
 * subscription rotated away, the switch turned off in /me — is worth asking
 * too, and costs the player nothing to say yes to, because no browser prompt
 * appears at all. A browser that has *denied* it is neither: nothing this
 * dialog can do will change that, and saying so unprompted is a lecture.
 */
export async function livesPushOffered(): Promise<boolean> {
  if (pushSupport() !== "ready") return false;
  if (pushPermission() === "denied") return false;
  if (await pushEnabled()) return false;
  try {
    return window.localStorage.getItem(DISMISSED) !== "1";
  } catch {
    // Storage switched off: asked once per visit rather than never, which is
    // the better of the two failures.
    return true;
  }
}

/** Remembered so the ask is a one-off however it ended. */
function remember() {
  try {
    window.localStorage.setItem(DISMISSED, "1");
  } catch {
    /* It gets one more chance on the next visit. Not worth handling. */
  }
}

export function LivesWatchDialog({ onClose }: { onClose: () => void }) {
  const { player } = usePlayer();
  const [phase, setPhase] = useState<Phase>("offer");

  const full = player.livesMax;

  const dismiss = () => {
    remember();
    onClose();
  };

  const accept = async () => {
    setPhase("busy");
    const granted = await enablePush();
    remember();
    if (!granted) {
      // Not an error and not worth a red panel: the browser has just shown its
      // own prompt and they answered it. The dialog says what is still true —
      // the pool refills either way — and gets out of the way.
      setPhase("refused");
      return;
    }

    // The subscription is what a push is sent to; the watch is what says this
    // particular player is waiting on a pool rather than on a hunt. A failure
    // here is not shown: they have granted permission, the daily job will
    // still reach them once they drift, and there is nothing they could do
    // about it from this dialog anyway.
    await fetch("/api/player/lives/watch", { method: "POST" }).catch(() => {});
    setPhase("done");
  };

  if (phase === "done") {
    return (
      <Modal
        above={
          <div className="mx-auto mb-1 size-24">
            <Boxy mood="cheer" className="size-full" />
          </div>
        }
        title="We’ll tell you"
        subtitle={`One notification, once the pool is back to ${full}.`}
        icon={<BellRing className="size-5 text-mint" aria-hidden />}
        width="sm"
        onClose={onClose}
        footer={
          <button
            type="button"
            onClick={onClose}
            style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
            className="btn-chunky w-full rounded-2xl bg-brass px-4 py-3.5 text-ink"
          >
            Right you are
          </button>
        }
      >
        <p className="rounded-2xl bg-mint/12 px-4 py-3 text-center text-sm text-mint">
          Nothing to do now. Close the tab, close the phone — the lives come
          back on their own and we’ll say when.
        </p>

        {/* Said plainly rather than left to be discovered. We look once a day,
            so the notification lands *after* the pool fills rather than at the
            moment it does — and somebody promised "the moment" and given six
            hours later is somebody who stops believing the next one. */}
        <p className="mt-3 text-center text-xs text-zinc-500">
          We check once a day, so it arrives after the pool fills rather than
          the second it does. The lives are waiting either way.
        </p>
      </Modal>
    );
  }

  if (phase === "refused") {
    return (
      <Modal
        above={
          <div className="mx-auto mb-1 size-24">
            <Boxy mood="happy" className="size-full" />
          </div>
        }
        title="No notifications, then"
        subtitle="Nothing else changes."
        icon={<HeartArt className="size-5" />}
        width="sm"
        onClose={onClose}
        footer={
          <button
            type="button"
            onClick={onClose}
            style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
            className="btn-chunky w-full rounded-2xl bg-brass px-4 py-3.5 text-ink"
          >
            Fine by me
          </button>
        }
      >
        <p className="rounded-2xl bg-black/25 px-4 py-3 text-center text-sm text-zinc-400">
          Your lives still refill on the hour, all the way back to {full}. You
          can turn notifications on later from your own page.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      above={
        <div className="mx-auto mb-1 size-24">
          <Boxy mood="thinking" className="size-full" />
        </div>
      }
      title="Want a nudge when they’re back?"
      subtitle="You’ve decided to wait. We can tell you when the wait is over."
      icon={<Bell className="size-5 text-grape" aria-hidden />}
      width="sm"
      onClose={dismiss}
      footer={
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => void accept()}
            disabled={phase === "busy"}
            style={{ "--btn-lip": "var(--grape-deep)" } as React.CSSProperties}
            className="btn-chunky flex w-full items-center justify-center gap-2 rounded-2xl bg-grape px-4 py-3.5 text-white disabled:opacity-60"
          >
            {phase === "busy" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Bell className="size-4" aria-hidden />
            )}
            Yes, tell me
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="w-full rounded-2xl px-4 py-2.5 text-sm font-bold text-zinc-400 transition hover:text-zinc-200"
          >
            No thanks
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {/*
          What the pool does on its own, stated before the offer — the
          notification is a convenience on top of a refill that happens whether
          or not anybody agrees to anything, and saying so is the difference
          between an offer and a sales pitch.
        */}
        <p className="flex items-center gap-3 rounded-2xl bg-black/25 px-4 py-3 text-sm text-zinc-300">
          <HeartArt className="size-6 shrink-0" />
          <span>
            One life an hour, free, up to {full}. Nothing here is for sale — the
            pool fills itself.
          </span>
        </p>

        <p className="text-sm text-zinc-400">
          Say yes and your browser will ask for permission. We send{" "}
          <strong className="text-zinc-200">one notification</strong> once the
          pool is full again — we look once a day, so it lands a while after it
          fills rather than the second it does. After that, only what you’d
          expect: a safe you’re hunting being cracked, or your best score being
          beaten.
        </p>
      </div>
    </Modal>
  );
}
