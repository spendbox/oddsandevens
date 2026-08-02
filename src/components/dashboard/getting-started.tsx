"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Gamepad2,
  Gift,
  HelpCircle,
  Palette,
  Share2,
  Sparkles,
} from "lucide-react";
import { DEFAULT_POINTS_PER_DISCOUNT } from "@/lib/constants";
import type { Merchant } from "./shared";

interface Step {
  key: "profile" | "reward" | "game" | "brand" | "share";
  title: string;
  description: string;
  done: boolean;
  actionLabel: string;
  icon: React.ReactNode;
  tutorial: string[];
}

function sharedKey(merchantId: string) {
  return `th_shared_${merchantId}`;
}

// First-login guide: a short checklist (add a reward, launch a game, brand the
// page, share the link) with a tutorial popup per step. Disappears once all
// steps are done or the merchant dismisses it.
export function GettingStarted({
  merchant,
  hasReward,
  hasGame,
  hasProfile,
  profilePercent,
  onCreateReward,
  onCreateGame,
  onOpenSettings,
}: {
  merchant: Merchant;
  hasReward: boolean;
  hasGame: boolean;
  /** Have they told us what kind of business they run? */
  hasProfile: boolean;
  /** How complete the picture of their business is, 0-100. */
  profilePercent: number;
  onCreateReward: () => void;
  onCreateGame: () => void;
  onOpenSettings: () => void;
}) {
  const [shared, setShared] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(sharedKey(merchant.id)) === "1"
  );
  const [tutorial, setTutorial] = useState<Step | null>(null);
  const [copied, setCopied] = useState(false);

  const branded =
    merchant.logo_url !== null ||
    (merchant.tagline !== null && merchant.tagline !== "") ||
    merchant.brand_color !== "#059669";

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/p/${merchant.slug}`
      : `/p/${merchant.slug}`;

  const steps: Step[] = [
    {
      key: "profile",
      title: "Tell us about your business",
      description:
        hasProfile
          ? `We know ${profilePercent}% of what we could — the rest sharpens your games.`
          : "A minute of tapping and we'll write your first games for you.",
      done: hasProfile,
      actionLabel: hasProfile ? "Add more" : "Start here",
      icon: <Sparkles className="size-4" aria-hidden />,
      tutorial: [
        "Open Settings and pick your trade, what you sell, and what you could give away — it's mostly tapping.",
        "The moment you save, we write a handful of games built around those answers and put them under Build → Games.",
        "You can keep adding detail later; the more we know, the better the games we write.",
      ],
    },
    {
      key: "reward",
      title: "Create a reward",
      description: "Add something worth winning — e.g. a free drink.",
      done: hasReward,
      actionLabel: "Add reward",
      icon: <Gift className="size-4" aria-hidden />,
      tutorial: [
        "Open Build → Rewards and add the prizes you want to give away (e.g. \"Free plate of jollof\").",
        "Set how long each reward stays valid once a customer wins it.",
        "You'll pick from these rewards when you build a game, so create them first.",
      ],
    },
    {
      key: "game",
      title: "Launch your first game",
      description: "Whack-a-mole, slice, flappy, mahjong or match three.",
      done: hasGame,
      actionLabel: "Create game",
      icon: <Gamepad2 className="size-4" aria-hidden />,
      tutorial: [
        "Open Build → Games and pick a game. Everything is pre-filled, and the preview lets you play it while you set it up.",
        "Choose what the top of the leaderboard wins each week, and how many of each you'll give away.",
        "Every score is settled on our servers, so a board can't be rigged from anyone's phone.",
      ],
    },
    {
      key: "brand",
      title: "Brand your page",
      description: "Logo, colors, and a tagline make it feel like yours.",
      done: branded,
      actionLabel: "Open settings",
      icon: <Palette className="size-4" aria-hidden />,
      tutorial: [
        "Upload your logo and pick your brand color — every game you share takes on your colors.",
        "Add a tagline and contact details so customers can reach you.",
        `Set your loyalty exchange rate: how many points (default ${DEFAULT_POINTS_PER_DISCOUNT}) buy what discount.`,
      ],
    },
    {
      key: "share",
      title: "Share your link",
      description: "Put it on your socials, receipts, or a counter QR code.",
      done: shared,
      actionLabel: copied ? "Copied!" : "Copy link",
      icon: <Share2 className="size-4" aria-hidden />,
      tutorial: [
        "Your games hub lives at the link on your dashboard, and every game also has its own link.",
        "Customers only need an email to join; they get a code by email when they win.",
        "Post the link on WhatsApp, Instagram, or print it as a QR code at the counter.",
      ],
    },
  ];

  const remaining = steps.filter((s) => !s.done).length;
  if (remaining === 0) return null;

  async function act(step: Step) {
    if (step.key === "profile") onOpenSettings();
    else if (step.key === "reward") onCreateReward();
    else if (step.key === "game") onCreateGame();
    else if (step.key === "brand") onOpenSettings();
    else {
      await navigator.clipboard.writeText(shareUrl);
      window.localStorage.setItem(sharedKey(merchant.id), "1");
      setShared(true);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <section className="card border-emerald-200 bg-gradient-to-br from-emerald-50/70 to-white p-4 sm:p-5">
      <div>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
          <Sparkles className="size-4" aria-hidden />
          Getting started
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          {steps.length - remaining} of {steps.length} done — a few quick steps
          and you&apos;re live.
        </p>
      </div>

      <ul className="mt-3 space-y-2">
        {steps.map((step) => (
          <li
            key={step.key}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={
                  "flex size-7 shrink-0 items-center justify-center rounded-full " +
                  (step.done
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-100 text-zinc-400")
                }
              >
                {step.done ? <Check className="size-4" aria-hidden /> : step.icon}
              </span>
              <div className="min-w-0">
                <p
                  className={
                    "text-sm font-medium " +
                    (step.done ? "text-zinc-400 line-through" : "text-zinc-800")
                  }
                >
                  {step.title}
                </p>
                {!step.done && (
                  <p className="text-xs text-zinc-500">{step.description}</p>
                )}
              </div>
            </div>
            {!step.done && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setTutorial(step)}
                  className="btn-ghost px-2 py-1.5"
                  aria-label={`How to: ${step.title}`}
                >
                  <HelpCircle className="size-4" aria-hidden />
                </button>
                <button
                  onClick={() => act(step)}
                  className="btn-primary px-3 py-1.5 text-xs"
                >
                  {step.key === "share" && !copied && (
                    <Copy className="size-3.5" aria-hidden />
                  )}
                  {step.actionLabel}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {tutorial && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-6 backdrop-blur-sm"
          onClick={() => setTutorial(null)}
        >
          <div
            className="animate-pop-in card w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-900">
              <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                {tutorial.icon}
              </span>
              {tutorial.title}
            </h3>
            <ol className="mt-4 space-y-3">
              {tutorial.tutorial.map((line, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-zinc-600">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-700">
                    {i + 1}
                  </span>
                  {line}
                </li>
              ))}
            </ol>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setTutorial(null)}
                className="btn-secondary grow"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const step = tutorial;
                  setTutorial(null);
                  act(step);
                }}
                className="btn-primary grow"
              >
                {tutorial.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
