"use client";

import Link from "next/link";
import { useState } from "react";
import { Lock } from "lucide-react";
import { usePlayer } from "@/components/player/player-context";
import { LivesBadge } from "@/components/player/lives-badge";
import { BuyLivesDialog } from "@/components/player/buy-lives-dialog";
import { VerifyDialog } from "@/components/player/verify-dialog";

export function SiteHeader() {
  const { verified, ready } = usePlayer();
  const [dialog, setDialog] = useState<"none" | "verify" | "lives">("none");

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/5 bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Lock className="size-5 text-brass" aria-hidden />
            <span>Spendbox</span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <LivesBadge onBuy={() => setDialog("lives")} />

            {ready && !verified && (
              <button
                type="button"
                onClick={() => setDialog("verify")}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-brass/40"
              >
                Sign in to play
              </button>
            )}

            {verified && (
              <Link
                href="/me"
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-brass/40"
              >
                You
              </Link>
            )}
          </div>
        </div>
      </header>

      {dialog === "verify" && <VerifyDialog onClose={() => setDialog("none")} />}
      {dialog === "lives" && <BuyLivesDialog onClose={() => setDialog("none")} />}
    </>
  );
}
