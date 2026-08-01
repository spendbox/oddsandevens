"use client";

// Wheel of Fortune. The server draws the segment; this only spins to it.

import { useState } from "react";
import { ActionButton, cfgStr, type GameProps } from "./kit";

const SPINS = 6; // full turns before settling, for the "it's really spinning" feel

export default function SpinWheel({
  config,
  prizes,
  accent,
  submit,
  showResult,
}: GameProps) {
  const [angle, setAngle] = useState(0);
  const [spinning, setSpinning] = useState(false);

  const segments = prizes.length
    ? prizes
    : [{ position: 0, description: "Try again", kind: "blank" as const }];
  const count = segments.length;
  const step = 360 / count;

  const spin = async () => {
    if (spinning) return;
    setSpinning(true);

    const outcome = await submit(1);
    if (!outcome) {
      setSpinning(false);
      return;
    }

    // No segment came back (everything sold out): land on any losing slot so
    // the wheel still tells the truth about the result.
    const blanks = segments
      .map((s, i) => (s.kind === "blank" ? i : -1))
      .filter((i) => i >= 0);
    const index =
      outcome.segmentIndex != null && outcome.segmentIndex < count
        ? outcome.segmentIndex
        : blanks.length > 0
          ? blanks[Math.floor(Math.random() * blanks.length)]
          : Math.floor(Math.random() * count);

    // Land the middle of that segment under the pointer at 12 o'clock.
    const target = SPINS * 360 - (index * step + step / 2);
    setAngle(target);
    window.setTimeout(() => {
      setSpinning(false);
      showResult();
    }, 5200);
  };

  const hubLabel = cfgStr(config, "hubLabel", "");
  const radius = 50;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-sm">
        {/* Pointer */}
        <div
          className="absolute left-1/2 top-0 z-10 h-0 w-0 -translate-x-1/2 -translate-y-1"
          style={{
            borderLeft: "12px solid transparent",
            borderRight: "12px solid transparent",
            borderTop: `22px solid ${accent}`,
            filter: "drop-shadow(0 2px 3px rgb(0 0 0 / 0.25))",
          }}
          aria-hidden
        />
        <svg
          viewBox="0 0 100 100"
          className="w-full drop-shadow-xl"
          style={{
            transform: `rotate(${angle}deg)`,
            transition: spinning
              ? "transform 5s cubic-bezier(0.15, 0.9, 0.2, 1)"
              : undefined,
          }}
          role="img"
          aria-label={`Prize wheel with ${count} segments`}
        >
          {segments.map((segment, i) => {
            const start = (i * step - 90) * (Math.PI / 180);
            const end = ((i + 1) * step - 90) * (Math.PI / 180);
            const x1 = 50 + radius * Math.cos(start);
            const y1 = 50 + radius * Math.sin(start);
            const x2 = 50 + radius * Math.cos(end);
            const y2 = 50 + radius * Math.sin(end);
            const largeArc = step > 180 ? 1 : 0;
            const mid = (start + end) / 2;
            const isPrize = segment.kind !== "blank";
            return (
              <g key={segment.position}>
                <path
                  d={`M50 50 L${x1} ${y1} A${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`}
                  fill={isPrize ? accent : "#f4f4f5"}
                  fillOpacity={isPrize ? (i % 2 ? 0.85 : 1) : 1}
                  stroke="#ffffff"
                  strokeWidth={0.6}
                />
                <text
                  x={50 + radius * 0.62 * Math.cos(mid)}
                  y={50 + radius * 0.62 * Math.sin(mid)}
                  fill={isPrize ? "#ffffff" : "#52525b"}
                  fontSize={count > 10 ? 3 : 3.8}
                  fontWeight={600}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${(mid * 180) / Math.PI + 90} ${
                    50 + radius * 0.62 * Math.cos(mid)
                  } ${50 + radius * 0.62 * Math.sin(mid)})`}
                >
                  {segment.description.length > 18
                    ? `${segment.description.slice(0, 17)}…`
                    : segment.description}
                </text>
              </g>
            );
          })}
          <circle cx="50" cy="50" r="11" fill="#ffffff" stroke="#e4e4e7" strokeWidth={1} />
          {hubLabel && (
            <text
              x="50"
              y="50"
              fontSize="4"
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#3f3f46"
            >
              {hubLabel.slice(0, 12)}
            </text>
          )}
        </svg>
      </div>

      <ActionButton onClick={spin} accent={accent} disabled={spinning}>
        {spinning ? "Spinning…" : cfgStr(config, "spinLabel", "SPIN")}
      </ActionButton>
    </div>
  );
}
