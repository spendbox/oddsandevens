"use client";

// Settings, as four things you can tap.
//
// It used to be every form stacked on one page, which meant scrolling past the
// whole of "about your business" to change a colour. These are cards: each one
// says what it is and what it's currently set to, and opens only when you ask
// it to. What a business needs from this screen most of the time is to *check*
// something, not change it — so the answer is on the card.

import { useState } from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronRight,
  Landmark,
  Palette,
} from "lucide-react";
import type { BusinessProfile } from "@/lib/business/profile";
import type { RewardTemplate } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { BrandSettings, DangerZone } from "./brand-settings";
import { BusinessProfileCard } from "./business-profile";
import { PayoutSettings } from "./payout-settings";
import type { Merchant } from "./shared";

type Panel = "about" | "brand" | "payouts" | "danger";

function SettingsCard({
  icon,
  title,
  status,
  tone = "normal",
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  status: React.ReactNode;
  tone?: "normal" | "warn" | "danger";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="card flex w-full cursor-pointer items-center gap-3 p-4 text-left transition hover:shadow-md active:scale-[0.99]"
    >
      <span
        className={
          "flex size-11 shrink-0 items-center justify-center rounded-xl " +
          (tone === "danger"
            ? "bg-rose-50 text-rose-600"
            : tone === "warn"
              ? "bg-amber-50 text-amber-600"
              : "bg-zinc-100 text-zinc-600")
        }
      >
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

export function SettingsPanel({
  merchant,
  profile,
  profilePercent,
  rewards,
  hasReward,
  hasGame,
  payoutReady,
  onRewardsChanged,
  onSaved,
  onProfileSaved,
}: {
  merchant: Merchant;
  profile: BusinessProfile;
  profilePercent: number;
  rewards: RewardTemplate[];
  hasReward: boolean;
  hasGame: boolean;
  payoutReady: boolean;
  onRewardsChanged: () => void;
  onSaved: () => Promise<void>;
  onProfileSaved: (created: number) => Promise<void>;
}) {
  const [open, setOpen] = useState<Panel | null>(null);

  const branded =
    merchant.logo_url !== null ||
    (merchant.tagline !== null && merchant.tagline !== "");

  return (
    <>
      <div className="flex flex-col gap-3">
        <SettingsCard
          icon={<Building2 className="size-5" aria-hidden />}
          title="About your business"
          status={
            profilePercent >= 100
              ? "All filled in"
              : `${profilePercent}% filled in — the rest sharpens your games`
          }
          onClick={() => setOpen("about")}
        />

        <SettingsCard
          icon={<Palette className="size-5" aria-hidden />}
          title="Brand"
          status={
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block size-3 shrink-0 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: merchant.brand_color }}
                aria-hidden
              />
              {merchant.business_name}
              {branded ? "" : " · no logo or tagline yet"}
            </span>
          }
          onClick={() => setOpen("brand")}
        />

        <SettingsCard
          icon={<Landmark className="size-5" aria-hidden />}
          title="Getting paid"
          tone={payoutReady ? "normal" : "warn"}
          status={
            payoutReady ? (
              <span className="flex items-center gap-1.5 text-emerald-700">
                <Check className="size-3.5 shrink-0" aria-hidden />
                Your bank account is connected
              </span>
            ) : (
              "Add your bank account — needed before a game can go live"
            )
          }
          onClick={() => setOpen("payouts")}
        />

        <SettingsCard
          icon={<AlertTriangle className="size-5" aria-hidden />}
          title="Your customer link"
          tone="danger"
          status={`/p/${merchant.slug}`}
          onClick={() => setOpen("danger")}
        />
      </div>

      {open === "about" && (
        <Modal
          title="About your business"
          subtitle="Tell us a little and we'll write the games for you."
          icon={<Building2 className="size-5 text-zinc-500" aria-hidden />}
          width="lg"
          onClose={() => setOpen(null)}
        >
          <BusinessProfileCard
            merchant={merchant}
            profile={profile}
            rewards={rewards}
            hasReward={hasReward}
            hasGame={hasGame}
            onRewardsChanged={onRewardsChanged}
            onSaved={async (created) => {
              setOpen(null);
              await onProfileSaved(created);
            }}
          />
        </Modal>
      )}

      {open === "brand" && (
        <Modal
          title="Brand"
          subtitle="Your logo and colour carry into every game you share."
          icon={<Palette className="size-5 text-zinc-500" aria-hidden />}
          onClose={() => setOpen(null)}
        >
          <BrandSettings merchant={merchant} onSaved={onSaved} />
        </Modal>
      )}

      {open === "payouts" && (
        <Modal
          title="Getting paid"
          icon={<Landmark className="size-5 text-zinc-500" aria-hidden />}
          onClose={() => setOpen(null)}
        >
          <PayoutSettings onSaved={() => void onSaved()} />
        </Modal>
      )}

      {open === "danger" && (
        <Modal
          title="Your customer link"
          icon={<AlertTriangle className="size-5 text-rose-500" aria-hidden />}
          width="sm"
          onClose={() => setOpen(null)}
        >
          <DangerZone merchant={merchant} onSaved={onSaved} />
        </Modal>
      )}
    </>
  );
}
