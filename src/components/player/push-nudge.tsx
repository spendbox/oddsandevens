"use client";

// The ask, at the only moment it is welcome.
//
// A permission prompt on arrival is the reason browsers built a "block this
// site forever" button, and a refusal is permanent in a way nothing else in a
// product is — there is no second prompt and no way for the site to undo it.
// So this appears exactly once, on the screen where somebody has just been
// told they won money, and it explains what it is for before the browser's own
// dialog appears over the top of it.
//
// If they dismiss it, it never comes back. The switch in /me is the way back.

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { enablePush, pushPermission, pushSupport } from "@/lib/push-client";

const DISMISSED = "spendbox_push_nudge_dismissed";

type State = "hidden" | "offer" | "busy" | "on";

/** Asked outside the component: it reads browser state, not React state. */
function shouldOffer(): boolean {
  if (pushSupport() !== "ready") return false;
  // "default" only. Never asked is the one state worth asking in — "granted"
  // needs nothing and "denied" cannot be changed from here.
  if (pushPermission() !== "default") return false;
  try {
    return window.localStorage.getItem(DISMISSED) !== "1";
  } catch {
    // A browser with storage switched off still gets asked once per visit,
    // which is the better failure than never being asked at all.
    return true;
  }
}

export function PushNudge({ reason }: { reason: string }) {
  const [state, setState] = useState<State>("hidden");

  useEffect(() => {
    let live = true;
    void (async () => {
      const offer = shouldOffer();
      if (live && offer) setState("offer");
    })();
    return () => {
      live = false;
    };
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED, "1");
    } catch {
      // Nothing to do; it simply gets one more chance next time.
    }
    setState("hidden");
  };

  const accept = async () => {
    setState("busy");
    const ok = await enablePush();
    // Either way this is the last time we ask. A "no" at the browser prompt is
    // an answer, and asking again is how a site gets blocked outright.
    if (!ok) return dismiss();
    try {
      window.localStorage.setItem(DISMISSED, "1");
    } catch {
      /* not important */
    }
    setState("on");
  };

  if (state === "hidden") return null;

  if (state === "on") {
    return (
      <p className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-mint/12 px-3 py-2.5 text-sm text-mint">
        <Bell className="size-4 shrink-0" aria-hidden />
        We’ll let you know.
      </p>
    );
  }

  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl bg-black/25 px-3 py-2.5 text-left">
      <Bell className="size-4 shrink-0 text-grape" aria-hidden />
      <span className="min-w-0 flex-1 text-sm text-zinc-300">{reason}</span>
      <button
        type="button"
        onClick={() => void accept()}
        disabled={state === "busy"}
        className="shrink-0 rounded-lg bg-grape px-3 py-1.5 text-xs font-black text-white transition active:translate-y-px disabled:opacity-60"
      >
        {state === "busy" ? "…" : "Yes"}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="No thanks"
        className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition hover:text-zinc-300"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
