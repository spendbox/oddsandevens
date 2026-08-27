"use client";

// The switch, and the four honest answers it has to be able to give.
//
// A toggle that is simply absent when push can't work is the worst version of
// this: somebody who has heard it exists goes looking, finds nothing, and
// concludes the site is broken. Every state below says what is true and, where
// there is one, what to do about it — including the one state a website cannot
// fix for itself, which is a permission the person has already denied.

import { useEffect, useState } from "react";
import { Bell, BellOff, Share, Loader2 } from "lucide-react";
import {
  disablePush,
  enablePush,
  pushEnabled,
  pushPermission,
  pushSupport,
  type PushSupport,
} from "@/lib/push-client";

type State = "loading" | "on" | "off" | "denied" | PushSupport;

/**
 * What the switch should be showing, asked fresh.
 *
 * Deliberately outside the component and free of `setState`: the state here
 * lives in the browser (a permission, a registration, a subscription), not in
 * React, so reading it is a question rather than a subscription — and keeping
 * the write at the single call site is what stops the effect below being a
 * cascading render.
 */
async function readState(): Promise<State> {
  const support = pushSupport();
  if (support !== "ready") return support;
  if (pushPermission() === "denied") return "denied";
  return (await pushEnabled()) ? "on" : "off";
}

export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const next = await readState();
      if (live) setState(next);
    })();
    return () => {
      live = false;
    };
  }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      if (state === "on") {
        await disablePush();
        // Off means off, including a pending "tell me when my lives are full".
        // The watch could not be delivered without a subscription anyway, but
        // leaving it would honour it if push were switched back on weeks later,
        // for a pool somebody stopped waiting on long ago.
        await fetch("/api/player/lives/watch", { method: "DELETE" }).catch(() => {});
      } else {
        const ok = await enablePush();
        // A refusal is not an error and gets no message: the browser has just
        // shown its own prompt and the person answered it. Saying "you said no"
        // back to them is nagging.
        if (!ok && pushPermission() === "denied") {
          setState("denied");
          return;
        }
      }
      setState(await readState());
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading") return null;

  if (state === "unsupported" || state === "unconfigured") {
    // Nothing actionable, so nothing that looks like a control.
    return (
      <Shell>
        <p className="text-sm text-zinc-400">
          This browser can’t do notifications. Nothing else changes — a reward
          still reaches you by email.
        </p>
      </Shell>
    );
  }

  if (state === "ios-needs-install") {
    return (
      <Shell>
        <p className="text-sm text-zinc-300">
          On iPhone, notifications only work once Spendbox is on your Home
          Screen.
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-zinc-400">
          Tap <Share className="size-4 shrink-0 text-sky" aria-hidden /> then{" "}
          <strong className="text-zinc-200">Add to Home Screen</strong>, and open
          it from there.
        </p>
      </Shell>
    );
  }

  if (state === "denied") {
    return (
      <Shell>
        <p className="text-sm text-zinc-300">Notifications are blocked.</p>
        <p className="mt-2 text-sm text-zinc-400">
          We can’t undo that from here — the browser holds it, which is rather
          the point. Allow notifications for this site in your browser settings
          and the switch comes back.
        </p>
      </Shell>
    );
  }

  const on = state === "on";
  return (
    <Shell>
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">
            {on ? "Notifications are on" : "Turn on notifications"}
          </span>
          <span className="block text-xs text-zinc-500">
            {on
              ? "When a safe you’re hunting is cracked, or your best gets beaten."
              : "Only for a safe you’re actually in. No daily nudges."}
          </span>
        </span>
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={busy}
          aria-pressed={on}
          className={
            "flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition active:translate-y-px disabled:opacity-60 " +
            (on
              ? "bg-white/8 text-zinc-300 hover:bg-white/12"
              : "bg-brass text-ink")
          }
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : on ? (
            <BellOff className="size-4" aria-hidden />
          ) : (
            <Bell className="size-4" aria-hidden />
          )}
          {on ? "Turn off" : "Turn on"}
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="panel rounded-2xl p-4">
      <h3 className="mb-2 text-sm font-black uppercase tracking-wide text-zinc-300">
        Notifications
      </h3>
      {children}
    </section>
  );
}
