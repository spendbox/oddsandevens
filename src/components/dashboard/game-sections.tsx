"use client";

// Setting up a game, one thing at a time.
//
// It used to be a single column: name, then every config field, then every
// prize, then the schedule — a scroll you had to get to the bottom of before
// anything was finished. Which is fine on a laptop and miserable on the phone
// most of these businesses actually use.
//
// So it's cards. Each says what it is and what it's currently set to, and
// opens only when tapped. That also means creating and editing a game are the
// same screen: whatever you can change later, you can change now.

import { useState } from "react";
import { ChevronRight, Gift, Settings2, Type } from "lucide-react";
import type { GameDefinition } from "@/lib/games/catalog";
import { rankLabel } from "@/lib/games/catalog";
import type { GameConfig } from "@/lib/games/types";
import type { PrizeRow } from "@/lib/games/slots";
import type { RewardTemplate } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { GameConfigEditor } from "./game-config-editor";
import { PrizePicker } from "./prize-picker";

type Panel = "name" | "settings" | "rewards";

function SectionCard({
  icon,
  title,
  status,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  status: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card flex w-full cursor-pointer items-center gap-3 p-4 text-left transition hover:shadow-md active:scale-[0.99]"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-zinc-900">{title}</span>
        <span className="block truncate text-sm text-zinc-500">{status}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-zinc-300" aria-hidden />
    </button>
  );
}

export function GameSections({
  def,
  title,
  description,
  config,
  prizes,
  rewards,
  onTitle,
  onDescription,
  onConfig,
  onPrizes,
  onCreateReward,
}: {
  def: GameDefinition;
  title: string;
  description: string;
  config: GameConfig;
  prizes: PrizeRow[];
  rewards: RewardTemplate[];
  onTitle: (next: string) => void;
  onDescription: (next: string) => void;
  onConfig: (next: GameConfig) => void;
  onPrizes: (next: PrizeRow[]) => void;
  onCreateReward?: () => void;
}) {
  const [open, setOpen] = useState<Panel | null>(null);

  const named = prizes.filter((p) => p.description.trim().length > 0);
  const prizeStatus =
    named.length === 0
      ? "Nothing to win yet — tap to pick"
      : named.length === 1
        ? `${rankLabel(1)}: ${named[0].description}`
        : `${named.length} places, ${named[0].description} on top`;

  return (
    <>
      <div className="flex flex-col gap-3">
        <SectionCard
          icon={<Type className="size-5" aria-hidden />}
          title="Name and blurb"
          status={title || def.label}
          onClick={() => setOpen("name")}
        />
        <SectionCard
          icon={<Settings2 className="size-5" aria-hidden />}
          title="Game settings"
          status={`${def.fields.length} things you can change`}
          onClick={() => setOpen("settings")}
        />
        <SectionCard
          icon={<Gift className="size-5" aria-hidden />}
          title="Rewards"
          status={prizeStatus}
          onClick={() => setOpen("rewards")}
        />
      </div>

      {open === "name" && (
        <Modal
          title="Name and blurb"
          icon={<Type className="size-5 text-zinc-500" aria-hidden />}
          onClose={() => setOpen(null)}
        >
          <label className="block">
            <span className="field-label">What players will see</span>
            <input
              value={title}
              onChange={(e) => onTitle(e.target.value)}
              maxLength={80}
              className="input-field"
            />
          </label>
          <label className="mt-3 block">
            <span className="field-label">One line about it</span>
            <textarea
              value={description}
              onChange={(e) => onDescription(e.target.value)}
              maxLength={300}
              rows={2}
              className="input-field resize-y"
            />
          </label>
        </Modal>
      )}

      {open === "settings" && (
        <Modal
          title="Game settings"
          icon={<Settings2 className="size-5 text-zinc-500" aria-hidden />}
          onClose={() => setOpen(null)}
        >
          <GameConfigEditor
            fields={def.fields}
            config={config}
            onChange={onConfig}
          />
        </Modal>
      )}

      {open === "rewards" && (
        <Modal
          title="Rewards"
          subtitle="Whoever finishes on top when the week closes gets these, by email."
          icon={<Gift className="size-5 text-zinc-500" aria-hidden />}
          width="lg"
          onClose={() => setOpen(null)}
        >
          <PrizePicker
            prizes={prizes}
            rewards={rewards}
            onChange={onPrizes}
            onCreateReward={onCreateReward}
          />
        </Modal>
      )}
    </>
  );
}
