import Link from "next/link";
import { Users } from "lucide-react";
import { rewardLabel } from "@/lib/game/rewards";
import { DifficultyBadge } from "@/components/difficulty-badge";
import { SafeArt } from "@/components/safe/safe-art";
import { plural } from "@/lib/plural";
import type { PublicBox } from "@/lib/types";

/** One safe in the lobby. The reward is the headline because it is the point. */
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
        {/* The contributor's own safe, at thumbnail size. An opened box shows
            it swung — the card should read as spent before you get to the
            greyed-out figure underneath. */}
        <SafeArt
          design={box.design}
          mood={open ? "open" : "idle"}
          className="size-11 shrink-0 transition group-hover:scale-105"
        />
      </div>

      <p
        className={
          "font-black tabular-nums " +
          (open
            ? "text-xl text-zinc-400"
            : box.isChallenge
              ? "text-xl text-zinc-300"
              : "brass-text text-2xl")
        }
      >
        {rewardLabel(box.rewardKobo)}
      </p>

      <DifficultyBadge difficulty={box.difficulty} />

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <Users className="size-3" aria-hidden />
          {plural(box.playersCount, "hunter")}
        </span>
        <span>{plural(box.attemptsCount, "attempt")}</span>
        {open && box.unlockedBy && (
          <span className="text-brass/70">opened by {box.unlockedBy}</span>
        )}
      </div>
    </Link>
  );
}
