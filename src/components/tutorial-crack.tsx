"use client";

// Cracking one safe, together, with the answer known in advance.
//
// Everything else in the tutorial is a description of the game. This is the
// game — a real password (`B0x!`), the real scoring, and nineteen guesses that
// happen to be the exact nineteen a good player would make. Nobody learns a
// deduction puzzle by being told that deduction is possible; they learn it by
// watching one number move and being told what the movement meant.
//
// Two rules held throughout:
//
//   The numbers are real. Every score below came from `score_attempt` run
//   against `B0x!`, and not one of them is rounded, flattered or invented. A
//   tutorial that lies about the arithmetic teaches a strategy that then fails
//   on the first real safe.
//
//   The scoring stays on the server. The weights behind those numbers are the
//   game's one genuine secret, and porting `score_attempt` into the browser to
//   compute this live would publish them in a JavaScript bundle to anybody who
//   opened the devtools. So the scores are written down here as constants. The
//   cost is that they must be recomputed by hand if the weights ever change —
//   which is the right trade, and the reason this comment exists.
//
// The player types every guess themselves, exactly, including its case. That is
// not busywork: `baaa` and `Baaa` are two different guesses with a ten-fold
// difference between them, and typing both is how that stops being a sentence
// and starts being a fact. There is a fill-it-in button for anybody who would
// rather watch.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, CornerDownLeft, MoveDown, MoveUp, Target } from "lucide-react";
import { Boxy, type BoxyMood } from "@/components/art/boxy";
import { SafeArt } from "@/components/safe/safe-art";
import { formatScore, type LengthHint } from "@/lib/game/feedback";
import { formatNaira } from "@/lib/game/rewards";

/** The practice password. Short, and one character from each class. */
const SECRET = "B0x!";

/** What the practice safe is holding. Not real money; it is a worked example. */
const PRIZE_KOBO = 250_000_00;

interface Beat {
  /** Exactly what they type. Case-sensitive, because case is half the lesson. */
  guess: string;
  hint: LengthHint;
  /** From `score_attempt(B0x!, guess)`. See the note at the top of this file. */
  score: number;
  /** Boxy, before the guess. */
  ask: ReactNode;
  /** Boxy, after it — what the number just told you. */
  learn: ReactNode;
  mood?: BoxyMood;
}

function Key({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-white/12 px-1.5 py-0.5 font-mono text-[0.95em] font-black text-brass">
      {children}
    </code>
  );
}

/*
 * The nineteen guesses, in four movements: how long is it, where is the digit,
 * what are the letters, and what is the symbol.
 *
 * The b-probe in the third movement is worth reading closely, because it is the
 * one place the obvious reading of the scores is backwards. `baaa` scores
 * *less* than `abaa`, `aaba` and `aaab` — and that is precisely how it gives
 * the position away. A character sitting in the wrong place is worth more than
 * the same character sitting in the right place with the wrong case, so the
 * probe that dips is the probe that found the spot. Somebody who assumed the
 * highest score wins would place the `b` in the one position it isn't.
 */
function beats(): Beat[] {
  return [
    // ---- How long is it? --------------------------------------------------
    {
      guess: "000",
      hint: "shorter",
      score: 25,
      ask: (
        <>
          Nobody tells you how long a password is, so that is the first thing to
          find out. Same character all the way across — <Key>000</Key> — and the
          only thing you are reading is the length verdict.
        </>
      ),
      learn: (
        <>
          <strong className="text-sky">Too short.</strong> Off by an unknown
          amount, but we now know the password is longer than three.
        </>
      ),
    },
    {
      guess: "00000",
      hint: "longer",
      score: 20,
      ask: (
        <>
          Overshoot deliberately. Try <Key>00000</Key> — five of them.
        </>
      ),
      learn: (
        <>
          <strong className="text-sky">Too long.</strong> So it is four. And look
          at the score: it went <em>down</em>, from 25% to 20%, on a guess with
          more of the right stuff in it. Padding past the real length dilutes
          every point you have. Long guesses are never free.
        </>
      ),
      mood: "sly",
    },
    {
      guess: "0000",
      hint: "exact",
      score: 25,
      ask: (
        <>
          Split the difference: <Key>0000</Key>.
        </>
      ),
      learn: (
        <>
          <strong className="text-mark-green">Right length — four characters.</strong>{" "}
          Every guess from here is four long, and the 25% is telling us something
          else as well: a <Key>0</Key> is in this password somewhere.
        </>
      ),
      mood: "cheer",
    },

    // ---- Where is the digit? ----------------------------------------------
    {
      guess: "aaaa",
      hint: "exact",
      score: 0,
      ask: (
        <>
          Now find a character that <em>isn&apos;t</em> in it. That sounds
          useless and it is the most useful move in the game. Try <Key>aaaa</Key>.
        </>
      ),
      learn: (
        <>
          <strong className="text-mint">Zero.</strong> No <Key>a</Key> anywhere —
          which makes <Key>a</Key> a <strong>blank</strong>. From here it is
          padding worth exactly nothing, so any guess built out of it scores only
          for the characters we deliberately put in.
        </>
      ),
      mood: "cheer",
    },
    {
      guess: "0aaa",
      hint: "exact",
      score: 7.5,
      ask: (
        <>
          Use the blank. One <Key>0</Key> at the front, padded out:{" "}
          <Key>0aaa</Key>. Now the score is about that single character.
        </>
      ),
      learn: (
        <>
          7.5% — real, but small. The <Key>0</Key> is in the password and it is{" "}
          <strong>not</strong> in the first position. A character in the wrong
          place still scores; it just scores badly.
        </>
      ),
    },
    {
      guess: "a0aa",
      hint: "exact",
      score: 25,
      ask: (
        <>
          Move it one along: <Key>a0aa</Key>.
        </>
      ),
      learn: (
        <>
          <strong className="text-brass-bright">7.5% to 25%.</strong> More than
          three times, from moving one character one place. That jump is what a
          character landing in its <em>right</em> position looks like, and there
          is nothing else it can be.
          <br />
          <br />
          The second character is <Key>0</Key>.
        </>
      ),
      mood: "cheer",
    },

    // ---- What are the letters? --------------------------------------------
    {
      guess: "baaa",
      hint: "exact",
      score: 2.5,
      ask: (
        <>
          Now walk a new character through the positions. Start with{" "}
          <Key>baaa</Key>.
          <br />
          <br />
          <span className="text-brass">
            One thing to keep in mind: nothing stops a password using the same
            character twice. This one doesn&apos;t, but on a real safe, don&apos;t
            assume a character you have placed can&apos;t also be somewhere else.
          </span>
        </>
      ),
      learn: (
        <>
          2.5%. Not nothing — so <Key>b</Key> <em>is</em> in the password. Hold
          that number; the next three guesses are what make it mean something.
        </>
      ),
    },
    {
      guess: "abaa",
      hint: "exact",
      score: 7.5,
      ask: (
        <>
          Same character, next position: <Key>abaa</Key>.
        </>
      ),
      learn: <>7.5%. Higher than the first one. Keep going.</>,
    },
    {
      guess: "aaba",
      hint: "exact",
      score: 7.5,
      ask: (
        <>
          And again: <Key>aaba</Key>.
        </>
      ),
      learn: <>7.5% again.</>,
    },
    {
      guess: "aaab",
      hint: "exact",
      score: 7.5,
      ask: (
        <>
          Last position: <Key>aaab</Key>.
        </>
      ),
      learn: (
        <>
          7.5% a third time — and now the shape is clear.{" "}
          <strong className="text-brass-bright">
            Three positions score 7.5% and one scores 2.5%.
          </strong>
          <br />
          <br />
          The odd one out is the answer, and it is the <em>low</em> one. A
          character in the wrong place is worth more than the same character in
          the right place with the wrong case. So <Key>b</Key> lives in position
          one — and it isn&apos;t a lowercase <Key>b</Key>.
        </>
      ),
      mood: "sly",
    },
    {
      guess: "Baaa",
      hint: "exact",
      score: 25,
      ask: (
        <>
          Test it. Same position, capital letter: <Key>Baaa</Key>.
        </>
      ),
      learn: (
        <>
          <strong className="text-brass-bright">2.5% to 25%.</strong> Ten times,
          for holding down shift.
          <br />
          <br />
          Two of four: the password starts <Key>B0</Key>.
        </>
      ),
      mood: "cheer",
    },

    // ---- The rest of the letters ------------------------------------------
    {
      guess: "cccc",
      hint: "exact",
      score: 0,
      ask: (
        <>
          Two to go, and no idea what they are. Sweep for them — four of one
          character at a time. <Key>cccc</Key>.
        </>
      ),
      learn: (
        <>
          Zero. No <Key>c</Key>. That is one guess and twenty-six candidates
          reduced to twenty-five — slow, honest work, and most of a real safe.
        </>
      ),
    },
    {
      guess: "xxxx",
      hint: "exact",
      score: 25,
      ask: (
        <>
          A little bird says skip ahead. <Key>xxxx</Key>.
        </>
      ),
      learn: (
        <>
          <strong className="text-brass-bright">25%.</strong> There is an{" "}
          <Key>x</Key> in there. We don&apos;t know where yet — four of them
          cover every position at once.
        </>
      ),
      mood: "cheer",
    },
    {
      guess: "aaxa",
      hint: "exact",
      score: 25,
      ask: (
        <>
          We already own positions one and two, so the <Key>x</Key> is in three
          or four. Test three: <Key>aaxa</Key>.
        </>
      ),
      learn: (
        <>
          25% — the same score, from a single <Key>x</Key> instead of four. One
          character is doing all of that work, so it is in the right place.
        </>
      ),
      mood: "cheer",
    },
    {
      guess: "aaax",
      hint: "exact",
      score: 7.5,
      ask: (
        <>
          Prove it by breaking it. Move the <Key>x</Key> along one:{" "}
          <Key>aaax</Key>.
        </>
      ),
      learn: (
        <>
          Straight back down to 7.5% — the wrong-place score we already know.
          Position three it is.
        </>
      ),
    },
    {
      guess: "aaXa",
      hint: "exact",
      score: 2.5,
      ask: (
        <>
          One thing left to check about it. Capitalise it: <Key>aaXa</Key>.
        </>
      ),
      learn: (
        <>
          2.5% — the wrong-case score. So it stays lowercase.{" "}
          <strong className="text-brass-bright">
            Three of four: <Key>B0x</Key>.
          </strong>
        </>
      ),
      mood: "sly",
    },

    // ---- The symbol -------------------------------------------------------
    {
      guess: "????",
      hint: "exact",
      score: 0,
      ask: (
        <>
          One character left, and we have had no luck with letters. Passwords
          love symbols. <Key>????</Key>.
        </>
      ),
      learn: <>Nothing. Not a question mark.</>,
    },
    {
      guess: "!!!!",
      hint: "exact",
      score: 25,
      ask: (
        <>
          Try the loud one: <Key>!!!!</Key>.
        </>
      ),
      learn: (
        <>
          <strong className="text-brass-bright">25%.</strong> There it is. And
          there is only one position left for it to be in.
        </>
      ),
      mood: "cheer",
    },
    {
      guess: SECRET,
      hint: "exact",
      score: 100,
      ask: (
        <>
          We know the whole thing. Type it: <Key>{SECRET}</Key>.
        </>
      ),
      learn: <>Open.</>,
      mood: "cheer",
    },
  ];
}

const LENGTH_CHIP: Record<LengthHint, { label: string; icon: typeof MoveUp; tone: string }> = {
  shorter: { label: "too short", icon: MoveUp, tone: "bg-sky/20 text-sky" },
  longer: { label: "too long", icon: MoveDown, tone: "bg-sky/20 text-sky" },
  exact: { label: "right length", icon: Target, tone: "bg-mint/20 text-mint" },
};

/**
 * The practice safe.
 *
 * Owns its own progress; the tutorial around it only hears about the end. It
 * reports `onSolved` once, when the last guess lands, and the card after this
 * one is the payout.
 */
export function TutorialCrack({ onSolved }: { onSolved: () => void }) {
  const all = beats();
  const [at, setAt] = useState(0);
  /** "ask" is waiting for them to type; "learn" is showing what it meant. */
  const [phase, setPhase] = useState<"ask" | "learn">("ask");
  const [typed, setTyped] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const tail = useRef<HTMLDivElement>(null);

  const beat = all[at];
  const done = at >= all.length - 1 && phase === "learn";
  const matches = typed === beat.guess;

  // The log grows downwards and the newest row is the one being talked about,
  // so it is kept in view rather than left below the fold.
  useEffect(() => {
    tail.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [at, phase]);

  useEffect(() => {
    if (phase === "ask") field.current?.focus();
  }, [phase, at]);

  function submit() {
    if (!matches) return;
    setPhase("learn");
  }

  function next() {
    if (done) {
      onSolved();
      return;
    }
    setAt((n) => n + 1);
    setTyped("");
    setPhase("ask");
  }

  const log = all.slice(0, phase === "learn" ? at + 1 : at);

  return (
    <div className="space-y-3 text-left">
      {/* What has been tried, and what each one came back with. */}
      <div className="max-h-40 space-y-1 overflow-y-auto rounded-2xl bg-black/25 p-2">
        {log.length === 0 ? (
          <p className="px-1 py-2 text-center text-xs text-zinc-500">
            Nothing tried yet. Four characters, and no idea what they are.
          </p>
        ) : (
          log.map((one, i) => {
            const chip = LENGTH_CHIP[one.hint];
            const ChipIcon = chip.icon;
            return (
              <div
                key={one.guess}
                className={
                  "flex items-center gap-2 rounded-xl px-2 py-1.5 " +
                  (i === log.length - 1 ? "animate-fade-up bg-white/8" : "")
                }
              >
                <span className="flex gap-0.5">
                  {one.guess.split("").map((ch, n) => (
                    <span
                      key={n}
                      className="flex size-5 items-center justify-center rounded border border-white/15 bg-white/8 font-mono text-[11px] font-black text-zinc-200"
                    >
                      {ch}
                    </span>
                  ))}
                </span>
                <span
                  className={
                    "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold " +
                    chip.tone
                  }
                >
                  <ChipIcon className="size-2.5" aria-hidden />
                  {chip.label}
                </span>
                <span
                  className={
                    "ml-auto font-mono text-sm font-black tabular-nums " +
                    (one.score >= 100
                      ? "text-brass"
                      : one.score >= 25
                        ? "text-mint"
                        : one.score > 0
                          ? "text-sky"
                          : "text-zinc-500")
                  }
                >
                  {formatScore(one.score)}
                </span>
              </div>
            );
          })
        )}
        <div ref={tail} />
      </div>

      {/* Boxy, and whichever half of the beat we are on. */}
      <div key={`${at}-${phase}`} className="animate-fade-up flex gap-2.5">
        <Boxy
          mood={phase === "learn" ? (beat.mood ?? "thinking") : "thinking"}
          className="mt-0.5 size-11 shrink-0"
        />
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-zinc-300">
          {phase === "ask" ? beat.ask : beat.learn}
        </p>
      </div>

      {phase === "ask" ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              ref={field}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              aria-label={`Type ${beat.guess}`}
              placeholder="Type it here"
              className="field flex-1 px-3 py-2.5 font-mono"
            />
            <button
              type="button"
              disabled={!matches}
              onClick={submit}
              style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
              className="btn-chunky flex items-center gap-1.5 rounded-2xl bg-brass px-4 py-2.5 text-ink disabled:opacity-40"
            >
              <CornerDownLeft className="size-4" aria-hidden />
              Guess
            </button>
          </div>

          {/* Nothing here is a gate — this is a lesson, not an exam. */}
          <button
            type="button"
            onClick={() => setTyped(beat.guess)}
            className="text-xs font-bold text-zinc-500 underline-offset-2 transition hover:text-zinc-300 hover:underline"
          >
            Type it for me
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={next}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky flex w-full items-center justify-center gap-2 rounded-2xl bg-brass px-4 py-3 text-ink"
        >
          {done ? "Open it" : "Next guess"}
          <ArrowRight className="size-4" aria-hidden />
        </button>
      )}

      <p className="text-center text-[11px] font-bold text-zinc-600">
        Guess {Math.min(at + 1, all.length)} of {all.length}
      </p>
    </div>
  );
}

/** The payout, once the practice safe is open. */
export function TutorialPrize() {
  return (
    <div className="space-y-3 text-center">
      <SafeArt design="brass" mood="open" className="mx-auto size-28" />
      <p className="flex justify-center gap-1">
        {SECRET.split("").map((ch, i) => (
          <span
            key={i}
            style={{ ["--i" as string]: i } as React.CSSProperties}
            className="animate-pop-in stagger flex size-9 items-center justify-center rounded-lg border-2 border-brass bg-brass/15 font-mono text-lg font-black text-brass"
          >
            {ch}
          </span>
        ))}
      </p>
      <p className="brass-text text-4xl font-black tracking-tight">
        {formatNaira(PRIZE_KOBO)}
      </p>
      <p className="text-sm leading-relaxed text-zinc-300">
        Nineteen guesses, no power-ups, and nothing spent. On a real safe that
        money is sent to your bank account{" "}
        <strong className="text-brass-bright">within 24 hours</strong>.
      </p>
    </div>
  );
}
