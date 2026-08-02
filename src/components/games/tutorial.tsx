"use client";

// How to play, shown once.
//
// Every one of these games is understood in a sentence, but the sentence has
// to be read *before* the first round rather than discovered by losing one —
// a player whose first go ends at zero because they didn't know bombs cost a
// life doesn't take a second go.
//
// It is shown once per game type per browser and then remembered, because the
// second time a player opens a game they already know: a tutorial that
// replays is an obstacle between them and the thing they came back for. The
// memory is deliberately per *type*, not per game, so a business running two
// match-threes doesn't explain matching twice.

import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";

const STORE_PREFIX = "spendbox_tutorial_";

export interface TutorialStep {
  icon: string;
  text: string;
}

/** Three lines each, at most. If it needs four, the game is too complicated. */
const TUTORIALS: Record<string, { title: string; steps: TutorialStep[] }> = {
  "whack-a-mole": {
    title: "Whack-a-Mole",
    steps: [
      { icon: "👆", text: "Tap what pops out of the holes." },
      { icon: "⚡", text: "The faster you hit it, the more it scores." },
      { icon: "💣", text: "Tapping the wrong thing costs you points." },
    ],
  },
  "slice-ninja": {
    title: "Slice Ninja",
    steps: [
      { icon: "✋", text: "Swipe across the screen to slice what's thrown up." },
      { icon: "🔥", text: "Catch several in one swipe for a combo bonus." },
      { icon: "💣", text: "Slicing a bomb costs a life. You have three." },
    ],
  },
  flappy: {
    title: "Flappy",
    steps: [
      { icon: "👆", text: "Tap anywhere to flap. Stop tapping and you drop." },
      { icon: "🚪", text: "Every gap you fly through is a point." },
      { icon: "❤️", text: "Three crashes and the round is over." },
    ],
  },
  "mahjong-3d": {
    title: "3D Mahjong",
    steps: [
      { icon: "👀", text: "Find two tiles with the same picture." },
      { icon: "🀄", text: "Only free tiles count: nothing on top, one side open." },
      { icon: "⏱️", text: "Clear the stack early and the leftover time scores." },
    ],
  },
  "match-3": {
    title: "Match Three",
    steps: [
      { icon: "👉", text: "Drag a jewel onto the one next to it to swap them." },
      { icon: "✨", text: "Three or more in a line clears them." },
      { icon: "🔥", text: "What falls in can match again — cascades pay double." },
    ],
  },
};

/** Whether this browser has already been shown a game's tutorial. */
function alreadySeen(type: string): boolean {
  try {
    return window.localStorage.getItem(STORE_PREFIX + type) === "1";
  } catch {
    // Storage blocked: show it. Annoying beats broken.
    return false;
  }
}

function remember(type: string) {
  try {
    window.localStorage.setItem(STORE_PREFIX + type, "1");
  } catch {
    // Nothing to do — it will show again next time.
  }
}

/**
 * Returns whether the tutorial should be shown for this game type, and a
 * function to dismiss it. Resolved in an effect rather than during render, so
 * the server and the client agree on the first paint.
 */
export function useTutorial(type: string) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let ignore = false;
    // A promise so state is only set from a callback.
    Promise.resolve(alreadySeen(type)).then((seen) => {
      if (!ignore) setShow(!seen);
    });
    return () => {
      ignore = true;
    };
  }, [type]);

  const dismiss = useCallback(() => {
    remember(type);
    setShow(false);
  }, [type]);

  return { show: show && type in TUTORIALS, dismiss };
}

export function Tutorial({
  type,
  accent,
  onDone,
}: {
  type: string;
  accent: string;
  onDone: () => void;
}) {
  const tutorial = TUTORIALS[type];
  if (!tutorial) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-sm">
      <div className="animate-pop w-full max-w-xs">
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">
          How to play
        </p>
        <h3 className="mt-1 text-center text-2xl font-extrabold text-white">
          {tutorial.title}
        </h3>

        <ol className="mt-5 flex flex-col gap-3">
          {tutorial.steps.map((step, i) => (
            <li key={i} className="flex items-center gap-3">
              <span
                className="emoji flex size-11 shrink-0 items-center justify-center rounded-2xl text-2xl"
                style={{ backgroundColor: `${accent}2e` }}
              >
                {step.icon}
              </span>
              <span className="text-sm leading-snug text-white/85">
                {step.text}
              </span>
            </li>
          ))}
        </ol>

        <button
          onClick={onDone}
          style={{ "--brand": accent } as React.CSSProperties}
          className="btn-play mt-6"
        >
          <Check className="size-5" aria-hidden />
          Got it
        </button>
        <p className="mt-2 text-center text-[11px] text-white/35">
          We won&apos;t show this again.
        </p>
      </div>
    </div>
  );
}
