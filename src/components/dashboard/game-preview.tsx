"use client";

// The builder's live preview: the real game, playing against the settings the
// business is editing right now, in the phone frame their customers will see.
//
// Nothing here touches the server. `submit` runs the same rules the Postgres
// engine runs — a weighted draw for chance games, a score threshold for the
// rest — so what the preview does is what the live game will do.

import { useMemo, useState } from "react";
import { RotateCcw, Smartphone } from "lucide-react";
import { GameRenderer } from "@/components/games";
import type { GameDefinition } from "@/lib/games/catalog";
import {
  buildChanceSlots,
  buildScoreSlots,
  slotsAsPublic,
  type PrizeRow,
} from "@/lib/games/slots";
import type { GameConfig, GameOutcome, PrizeDraft } from "@/lib/games/types";

function simulate(
  def: GameDefinition,
  slots: PrizeDraft[],
  score: number
): GameOutcome {
  let index = -1;

  if (def.engine === "chance") {
    // Weighted draw across every segment, exactly like finish_game_play.
    const total = slots.reduce((sum, slot) => sum + (slot.weight ?? 1), 0);
    let roll = Math.random() * total;
    for (let i = 0; i < slots.length; i++) {
      roll -= slots[i].weight ?? 1;
      if (roll < 0) {
        index = i;
        break;
      }
    }
  } else {
    // Best prize whose bar this score clears.
    let best = -1;
    slots.forEach((slot, i) => {
      if (slot.kind !== "prize") return;
      if ((slot.min_score ?? 0) > score) return;
      if (best < 0 || (slot.min_score ?? 0) > (slots[best].min_score ?? 0)) {
        best = i;
      }
    });
    index = best;
  }

  const landed = index >= 0 ? slots[index] : null;
  const won = landed?.kind === "prize";

  return {
    result: won ? "win" : "lose",
    segmentIndex: index >= 0 ? index : null,
    prize: won
      ? {
          description: landed!.description,
          details: landed!.details ?? null,
          icon: landed!.icon ?? null,
        }
      : null,
    code: won ? "PREVEW" : null,
    expiresAt: won
      ? new Date(Date.now() + 30 * 86_400_000).toISOString()
      : null,
    score,
    bestScore: score,
    rank: 1,
    loyaltyPoints: won ? 0 : 1,
    pointsExpireAt: null,
    loyaltyCode: null,
    canWinAgain: true,
    nextPlayAt: null,
  };
}

export function GamePreview({
  def,
  config,
  prizes,
  winPercent,
  accent,
}: {
  def: GameDefinition;
  config: GameConfig;
  prizes: PrizeRow[];
  winPercent: number;
  accent: string;
}) {
  const [round, setRound] = useState(0);
  const [outcome, setOutcome] = useState<GameOutcome | null>(null);
  const [revealed, setRevealed] = useState(false);

  const slots = useMemo(() => {
    const named = prizes.filter((p) => p.description.trim().length > 0);
    // An unnamed first prize still needs a segment, or a wheel has nothing on it.
    const rows: PrizeRow[] =
      named.length > 0
        ? named
        : [
            {
              description: "Your prize",
              details: "",
              icon: null,
              expiryDays: 30,
              stock: 10,
              minScore: def.defaultTarget,
            },
          ];
    return def.engine === "chance"
      ? buildChanceSlots(rows, winPercent)
      : buildScoreSlots(rows);
  }, [prizes, winPercent, def]);

  const publicSlots = useMemo(() => slotsAsPublic(slots), [slots]);

  const replay = () => {
    setOutcome(null);
    setRevealed(false);
    setRound((n) => n + 1);
  };

  // Remounting on any settings change is the point: edit a field, see the
  // game rebuild itself.
  const key = `${round}:${JSON.stringify(config)}:${JSON.stringify(slots)}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="section-title">
          <Smartphone className="size-3.5" aria-hidden /> Live preview
        </p>
        <button onClick={replay} className="btn-ghost text-xs">
          <RotateCcw className="size-3.5" aria-hidden />
          Reset
        </button>
      </div>

      {/* Phone frame — this is what a customer opens. */}
      <div className="mx-auto w-full max-w-[22rem] rounded-[2rem] border-8 border-zinc-900 bg-white shadow-xl">
        <div className="flex justify-center pt-2" aria-hidden>
          <span className="h-1.5 w-16 rounded-full bg-zinc-200" />
        </div>
        <div className="max-h-[30rem] overflow-y-auto p-4">
          {revealed && outcome ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="text-4xl">
                {outcome.result === "win" ? "🎉" : "🙂"}
              </span>
              <p className="text-lg font-bold text-zinc-900">
                {outcome.result === "win"
                  ? outcome.prize?.description
                  : "No prize this time"}
              </p>
              {outcome.result === "win" ? (
                <p className="font-mono text-2xl font-bold tracking-[0.3em] text-zinc-900">
                  ABC123
                </p>
              ) : (
                <p className="text-sm text-zinc-500">
                  They still earn a loyalty point.
                </p>
              )}
              <p className="text-xs text-zinc-400">
                Preview only — no code was issued.
              </p>
              <button
                onClick={replay}
                style={{ backgroundColor: accent }}
                className="btn-primary mt-1 text-sm"
              >
                Play it again
              </button>
            </div>
          ) : (
            <GameRenderer
              key={key}
              type={def.type}
              config={config}
              prizes={publicSlots}
              accent={accent}
              canWin
              submit={async (score) => {
                const result = simulate(def, slots, score);
                setOutcome(result);
                return result;
              }}
              showResult={() => setRevealed(true)}
            />
          )}
        </div>
      </div>

      <p className="text-center text-xs text-zinc-500">
        Play it yourself — this is the real game, running on your settings.
      </p>
    </div>
  );
}
