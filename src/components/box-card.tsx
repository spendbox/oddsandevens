import Link from "next/link";
import { Lock, LockOpen, Users } from "lucide-react";
import { formatNaira } from "@/lib/game/stakes";
import type { PublicBox } from "@/lib/types";

/** One safe in the lobby. The prize is the headline because it is the point. */
export function BoxCard({ box, index = 0 }: { box: PublicBox; index?: number }) {
  const open = box.status === "unlocked";

  return (
    <Link
      href={`/b/${box.slug}`}
      style={{ ["--i" as string]: index }}
      className={
        "panel animate-fade-up stagger group flex flex-col gap-3 rounded-2xl p-4 transition hover:border-brass/40 " +
        (open ? "opacity-70" : "")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-zinc-100">{box.title}</p>
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            {box.kind === "general" ? "The public box" : `by ${box.contributor}`}
          </p>
        </div>
        <span
          className={
            "flex size-9 shrink-0 items-center justify-center rounded-lg " +
            (open ? "bg-white/5" : "bg-brass/10")
          }
        >
          {open ? (
            <LockOpen className="size-4 text-zinc-400" aria-hidden />
          ) : (
            <Lock className="size-4 text-brass" aria-hidden />
          )}
        </span>
      </div>

      <p
        className={
          "text-2xl font-black tabular-nums " + (open ? "text-zinc-400" : "brass-text")
        }
      >
        {formatNaira(box.prizeKobo)}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        <span>{box.length} characters</span>
        <span className="flex items-center gap-1">
          <Users className="size-3" aria-hidden />
          {box.playersCount}
        </span>
        {open && box.unlockedBy && (
          <span className="text-brass/70">opened by {box.unlockedBy}</span>
        )}
      </div>
    </Link>
  );
}
