"use client";

// The front page, which knows whether you're signed in.
//
// A visitor gets the pitch: three words, the featured safes, one button. A
// player gets the board — the full list of locked safes and the wall of cracked
// ones — because they already know what this is and are here to pick something.
//
// That's the reason this is a client component. The board is behind a session,
// and a session lives in the browser.

import { useEffect, useState } from "react";
import { ArrowRight, GraduationCap, Swords, Trophy } from "lucide-react";
import { Boxy } from "@/components/art/boxy";
import { SafeArt } from "@/components/safe/safe-art";
import { BoxCard } from "@/components/box-card";
import { Featured } from "@/components/featured";
import { InPlay } from "@/components/in-play";
import { Tutorial, tutorialSeen } from "@/components/tutorial";
import { HowItWorksButton } from "@/components/how-it-works";
import { BuildDialog } from "@/components/build-dialog";
import { usePlayer } from "@/components/player/player-context";
import { VerifyDialog } from "@/components/player/account-dialog";
import { plural } from "@/lib/plural";
import type { PublicBox } from "@/lib/types";

type Tab = "locked" | "cracked";

export function Landing({
  featured,
  locked,
  cracked,
}: {
  featured: PublicBox[];
  locked: PublicBox[];
  cracked: PublicBox[];
}) {
  const { verified, ready } = usePlayer();
  const [tab, setTab] = useState<Tab>("locked");
  const [signIn, setSignIn] = useState(false);
  const [showAll, setShowAll] = useState(false);
  /*
   * The tutorial, once per device.
   *
   * Read in an effect rather than during render: `localStorage` doesn't exist
   * on the server, and reading it while rendering would make the first client
   * paint disagree with the markup that arrived.
   */
  const [tutorial, setTutorial] = useState(false);
  useEffect(() => {
    if (!verified) return;
    if (tutorialSeen()) return;
    const id = window.setTimeout(() => setTutorial(true), 600);
    return () => window.clearTimeout(id);
  }, [verified]);

  const boardOpen = verified || showAll;
  const boxes = tab === "locked" ? locked : cracked;

  return (
    <>
      <section className="relative mx-auto w-full max-w-5xl px-4 pb-10 pt-10 sm:pt-14">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 size-[34rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-brass/10 blur-3xl"
        />

        <div className="animate-fade-up mx-auto max-w-2xl text-center">
          <div className="flex items-end justify-center gap-1">
            <SafeArt design="midnight" className="size-20 opacity-90 sm:size-24" />
            <Boxy mood="sly" className="size-32 drop-shadow-2xl sm:size-40" />
            <SafeArt design="emerald" className="size-20 opacity-90 sm:size-24" />
          </div>

          {/*
            Three lines and nothing else. The paragraph that used to live here
            was true, useful, and four sentences of onboarding standing between
            somebody and the board. It's in the explainer now, one tap away.
          */}
          <h1 className="mt-2 text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
            Break the code.
            <br />
            Unlock the safe.
            <br />
            <span className="brass-text">Claim the prize.</span>
          </h1>
        </div>

        <div className="animate-fade-up mx-auto mt-8 max-w-3xl">
          <Featured boxes={featured} />
        </div>

        {/*
          Two ways in, and they are not the same thing. "How it works" is the
          reference — the rules, in a list, for the question you already have.
          The walkthrough is the lesson: a real safe cracked a guess at a time.

          It lives here permanently rather than only firing itself once per
          device. The auto-open below still happens for a brand new player, but
          somebody who skipped it on a bus used to have no way back to it, and
          the walkthrough is the single most useful thing on this page for
          anybody who has bounced off a hard box.
        */}
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <HowItWorksButton />
          <button
            type="button"
            onClick={() => setTutorial(true)}
            className="inline-flex items-center gap-2 rounded-2xl border-2 border-brass/40 bg-brass/12 px-5 py-3.5 font-bold text-brass transition hover:border-brass/70 hover:bg-brass/20 active:translate-y-0.5"
          >
            <GraduationCap className="size-4" aria-hidden />
            Crack one with Boxy
          </button>
        </div>
      </section>

      {/* Above the board, and only for somebody who has one: the safes they
          already have open. It renders nothing at all otherwise. */}
      <InPlay enabled={verified} />

      <section className="mx-auto w-full max-w-5xl px-4 pb-12">
        {!boardOpen ? (
          // The board is the reason to have an account, so it is the thing an
          // account gets you. Not a wall — one tap either way.
          <div className="panel rounded-3xl px-6 py-10 text-center">
            <Boxy mood="sly" className="mx-auto size-24" />
            <p className="mt-1 text-xl font-black tracking-tight">
              {plural(locked.length, "safe")} still locked
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-zinc-400">
              Sign in to see every one of them, and the wall of safes people have
              already cracked.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              {ready && !verified && (
                <button
                  type="button"
                  onClick={() => setSignIn(true)}
                  style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
                  className="btn-chunky rounded-2xl bg-brass px-6 py-3.5 text-ink"
                >
                  Sign in to play
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="rounded-2xl border-2 border-white/15 bg-white/6 px-5 py-3.5 font-bold transition hover:border-brass/50 hover:bg-white/10 active:translate-y-0.5"
              >
                Just let me look
              </button>
            </div>
          </div>
        ) : (
          <>
            <div role="tablist" className="panel mb-4 flex gap-1 rounded-2xl p-1.5">
              <Tab
                id="locked"
                active={tab}
                onPick={setTab}
                icon={<Swords className="size-4" aria-hidden />}
                label="Locked safes"
                count={locked.length}
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
                <Boxy mood={tab === "locked" ? "happy" : "sly"} className="mx-auto size-24" />
                <p className="mt-1 font-black tracking-tight">
                  {tab === "locked"
                    ? "Nothing locked right now."
                    : "Nobody's cracked one yet."}
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  {tab === "locked"
                    ? "Put one up yourself and it'll be the first."
                    : "Be the first, and your name goes on this wall."}
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {boxes.map((box, i) => (
                  <BoxCard key={box.slug} box={box} index={i} />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <PutOneUp />

      {signIn && <VerifyDialog onClose={() => setSignIn(false)} />}
      {tutorial && <Tutorial onClose={() => setTutorial(false)} />}
    </>
  );
}

/**
 * The other half of the product, as a button.
 *
 * It was a card with two paragraphs and two buttons — a lot of page for
 * something most visitors are not here to do. The pitch is the same, it just
 * waits behind a tap now.
 */
function PutOneUp() {
  const [open, setOpen] = useState(false);

  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-16 text-center">
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ "--btn-lip": "var(--grape-deep)" } as React.CSSProperties}
        className="btn-chunky inline-flex items-center gap-2 rounded-2xl bg-grape px-7 py-4 text-lg text-ink"
      >
        Build your own Spendbox
        <ArrowRight className="size-5" aria-hidden />
      </button>
      {open && <BuildDialog onClose={() => setOpen(false)} />}
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
        "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 py-2.5 text-[13px] font-bold transition active:translate-y-px sm:gap-2 sm:px-3 sm:text-sm " +
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
