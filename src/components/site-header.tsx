"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Home } from "lucide-react";
import { usePlayer } from "@/components/player/player-context";
import { Boxy } from "@/components/art/boxy";
import { LivesBadge } from "@/components/player/lives-badge";
import { BuyLivesDialog } from "@/components/player/buy-lives-dialog";
import { VerifyDialog } from "@/components/player/account-dialog";

/**
 * The header, with the mascot in the lockup.
 *
 * A wordmark and a lock icon said "financial services". Boxy in the corner
 * says what this actually is within about a tenth of a second, which is the
 * only budget a header gets.
 */
export function SiteHeader() {
  const { verified, ready } = usePlayer();
  const [dialog, setDialog] = useState<"none" | "verify" | "lives">("none");
  const onSafehouse = usePathname().startsWith("/me");

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-2.5">
          <Link href="/" className="group flex items-center gap-2">
            <Boxy
              mood="happy"
              still
              className="size-9 transition group-hover:scale-110"
            />
            <span className="text-lg font-black tracking-tight">Spendbox</span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <LivesBadge onBuy={() => setDialog("lives")} />

            {ready && !verified && (
              <button
                type="button"
                onClick={() => setDialog("verify")}
                style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
                className="btn-chunky rounded-xl bg-brass px-4 py-2 text-sm text-ink"
              >
                Play
              </button>
            )}

            {/*
              One button, and it always points at the place you are not. It
              used to say "You" everywhere including *on* the safehouse, where
              it was a link to the page already open — so the only way back to
              the board was the browser's back button or the wordmark.
            */}
            {verified && (
              <Link
                href={onSafehouse ? "/" : "/me"}
                className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-sm font-bold transition hover:border-brass/50"
              >
                {onSafehouse ? (
                  <>
                    <Home className="size-4" aria-hidden />
                    Home
                  </>
                ) : (
                  "You"
                )}
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
