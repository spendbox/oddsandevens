"use client";

// Temporary visual harness — not shipped.

import { useState } from "react";
import { X } from "lucide-react";
import { GameRenderer } from "@/components/games";

const ACCENT = "#e11d48";
const CONFIGS: Record<string, Record<string, unknown>> = {
  "match-3": { moves: 25, size: 7, pieces: 5 },
  "mahjong-3d": { faces: "🍕 🍔 🌮 🍜 🍩 ☕ 🥗 🍣", layout: "pyramid", timeLimit: 120 },
  "whack-a-mole": { duration: 40, holes: 9 },
  flappy: { lives: 3 },
  "slice-ninja": { sliceEmojis: "🍉 🍊 🍏", duration: 45 },
};

export default function DevPreview() {
  const [type, setType] = useState("match-3");
  return (
    <main
      className="arcade fixed inset-0 z-50 flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden p-2 sm:p-3"
      style={{ "--brand": ACCENT } as React.CSSProperties}
    >
      <div className="mb-2 flex shrink-0 items-center gap-2 overflow-x-auto">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80">
          <X className="size-5" aria-hidden />
        </span>
        {Object.keys(CONFIGS).map((key) => (
          <button key={key} onClick={() => setType(key)} className="arcade-chip shrink-0 text-xs">
            {key}
          </button>
        ))}
      </div>
      <div className="stage-fill min-h-0 flex-1 rounded-2xl bg-gradient-to-b from-zinc-100 to-zinc-50 p-2 shadow-[inset_0_1px_3px_rgb(0_0_0/0.12)]">
        <GameRenderer
          key={type}
          type={type}
          config={CONFIGS[type]}
          prizes={[]}
          accent={ACCENT}
          canWin
          submit={async () => null}
          showResult={() => {}}
        />
      </div>
    </main>
  );
}
