"use client";

// Digital scratch card. The prize is drawn the moment the first scratch lands,
// so what appears under the foil was decided by the server, not the finger.

import { useCallback, useEffect, useRef, useState } from "react";
import { ActionButton, cfgNum, cfgStr, type GameProps } from "./kit";
import type { GameOutcome } from "@/lib/games/types";

export default function ScratchCard({
  config,
  accent,
  submit,
  showResult,
}: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const startedRef = useRef(false);
  const clearedRef = useRef(false);
  const [outcome, setOutcome] = useState<GameOutcome | null>(null);
  const [percent, setPercent] = useState(0);
  const [cleared, setCleared] = useState(false);
  const [failed, setFailed] = useState(false);

  const brush = cfgNum(config, "brushSize", 26);
  const threshold = cfgNum(config, "revealPercent", 45);

  // Paint the foil once the canvas has a size.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(rect.width * dpr, 1);
    canvas.height = Math.max(rect.height * dpr, 1);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const gradient = ctx.createLinearGradient(0, 0, rect.width, rect.height);
    gradient.addColorStop(0, "#d4d4d8");
    gradient.addColorStop(0.5, "#a1a1aa");
    gradient.addColorStop(1, "#d4d4d8");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "600 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      cfgStr(config, "coverText", "Scratch here"),
      rect.width / 2,
      rect.height / 2
    );
  }, [config]);

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return 0;
    // Sample a grid rather than every pixel — plenty accurate, far cheaper.
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let clear = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += 4 * 64) {
      total++;
      if (data[i] < 40) clear++;
    }
    return total === 0 ? 0 : Math.round((clear / total) * 100);
  }, []);

  const scratchAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(clientX - rect.left, clientY - rect.top, brush, 0, Math.PI * 2);
    ctx.fill();
  };

  const beginScratch = async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    const result = await submit(1);
    if (!result) {
      setFailed(true);
      return;
    }
    setOutcome(result);
  };

  const onMove = (clientX: number, clientY: number) => {
    if (!drawingRef.current || clearedRef.current) return;
    scratchAt(clientX, clientY);
    const pct = measure();
    setPercent(pct);
    if (pct >= threshold) {
      clearedRef.current = true;
      setCleared(true);
      // Wipe the rest so the reveal feels deliberate rather than patchy.
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      window.setTimeout(showResult, 700);
    }
  };

  const won = outcome?.result === "win";

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-zinc-200 shadow-lg"
        style={{ aspectRatio: "8 / 5" }}
      >
        {/* What's underneath — revealed as the foil comes off. */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-5 text-center"
          style={{
            background: won
              ? `linear-gradient(135deg, ${accent}, ${accent}cc)`
              : "linear-gradient(135deg, #f4f4f5, #e4e4e7)",
          }}
        >
          {outcome ? (
            <>
              <span className="emoji text-4xl">{won ? "🎉" : "🙂"}</span>
              <p
                className={
                  "text-lg font-bold " + (won ? "text-white" : "text-zinc-700")
                }
              >
                {won ? outcome.prize?.description : "Not this time"}
              </p>
              {!won && (
                <p className="text-xs text-zinc-500">
                  You still earned a loyalty point.
                </p>
              )}
            </>
          ) : (
            <span className="text-sm text-zinc-400">…</span>
          )}
        </div>

        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-grab touch-none"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawingRef.current = true;
            void beginScratch();
            onMove(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => onMove(e.clientX, e.clientY)}
          onPointerUp={() => {
            drawingRef.current = false;
          }}
          onPointerCancel={() => {
            drawingRef.current = false;
          }}
        />
      </div>

      <p className="text-sm text-zinc-500">
        {failed
          ? "Something went wrong — reload and try again."
          : cleared
            ? "Revealed!"
            : `Scratch the foil to reveal your prize (${Math.min(
                percent,
                threshold
              )}/${threshold}%)`}
      </p>

      {cleared && (
        <ActionButton onClick={showResult} accent={accent}>
          See my result
        </ActionButton>
      )}
    </div>
  );
}
