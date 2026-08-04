"use client";

// The board.
//
// Two subtabs rather than two stacked sections. Cracked boxes are worth
// showing — they're the proof the money is real, and the first thing a sceptic
// looks for — but they are not what anybody came to *do*, and a lobby that
// makes you scroll past a graveyard to find something playable has its
// priorities the wrong way round.

import { useState } from "react";
import { Swords, Trophy } from "lucide-react";
import { Boxy } from "@/components/art/boxy";
import { BoxCard } from "@/components/box-card";
import { plural } from "@/lib/plural";
import type { PublicBox } from "@/lib/types";

type Tab = "open" | "cracked";

export function Lobby({ open, cracked }: { open: PublicBox[]; cracked: PublicBox[] }) {
  const [tab, setTab] = useState<Tab>("open");
  const boxes = tab === "open" ? open : cracked;

  if (open.length === 0 && cracked.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-12">
      <div role="tablist" className="panel mb-4 flex gap-1 rounded-2xl p-1.5">
        <Tab
          id="open"
          active={tab}
          onPick={setTab}
          icon={<Swords className="size-4" aria-hidden />}
          label="Open safes"
          count={open.length}
        />
        <Tab
          id="cracked"
          active={tab}
          onPick={setTab}
          icon={<Trophy className="size-4" aria-hidden />}
          label="Already cracked"
          count={cracked.length}
        />
      </div>

      {boxes.length === 0 ? (
        <div className="panel rounded-3xl px-4 py-10 text-center">
          <Boxy mood={tab === "open" ? "happy" : "sly"} className="mx-auto size-24" />
          <p className="mt-1 font-black tracking-tight">
            {tab === "open" ? "Nothing open right now." : "Nobody's cracked one yet."}
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            {tab === "open"
              ? "Put one up yourself and it'll be the first."
              : "Be the first, and your safe goes on this wall."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {boxes.map((box, i) => (
              <BoxCard key={box.slug} box={box} index={i} />
            ))}
          </div>
          {tab === "cracked" && (
            <p className="mt-4 text-center text-sm text-zinc-500">
              {plural(cracked.length, "safe")} opened, and every reward paid to
              whoever opened it.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Tab({
  id,
  active,
  onPick,
  icon,
  label,
  count,
}: {
  id: Tab;
  active: Tab;
  onPick: (tab: Tab) => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  const on = active === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={() => onPick(id)}
      className={
        "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition active:translate-y-px " +
        (on
          ? "bg-brass text-ink shadow-[inset_0_1.5px_0_rgba(255,255,255,0.45),0_3px_0_var(--brass-deep)]"
          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100")
      }
    >
      {icon}
      {label}
      <span
        className={
          "rounded-md px-1.5 py-0.5 font-mono text-[10px] font-black " +
          (on ? "bg-ink/20 text-ink" : "bg-white/8 text-zinc-400")
        }
      >
        {count}
      </span>
    </button>
  );
}
