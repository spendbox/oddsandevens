"use client";

// Cracking one safe, together, with the answer known in advance.
//
// Everything else in the tutorial is a description of the game. This is the
// game — a real password (`B0x!`), the real scoring, and twenty guesses that
// happen to be the exact twenty a good player would make. Nobody learns a
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
//   which is the right trade, and the reason this comment exists. To redo them,
//   against the database and not by hand arithmetic:
//
//       select g.v, s.score_percent
//         from (values ('000'), ('00000'), …) g(v)
//         cross join lateral public.score_attempt('B0x!', g.v) s;
//
// The player types every guess themselves, exactly, including its case. That is
// not busywork: `baaa` and `Baaa` are two different guesses exactly twice apart,
// and typing both is how that stops being a sentence and starts being a fact.
// There is a fill-it-in button for anybody who would rather watch.
//
// One thing this must never do, and it is easy to do by accident: explain *why*
// one character's numbers are larger than another's. 0051 gave every character
// its own worth, so the `0` beats live down at one and a half percent while the
// `B` beats are up in the forties. The tutorial reports both honestly and draws
// no comparison between them, because the comparison is the price list and the
// price list is the secret. Everything taught here is taught by watching a
// *single* character's own number double or halve, which is a real, universal
// rule and gives nothing away.

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
 * The twenty guesses, in four movements: how long is it, where is the digit,
 * what are the letters, and what is the symbol.
 *
 * Three of the beats teach the shape of the scale rather than a character, and
 * they are the three worth not cutting:
 *
 *   The b-probe. `baaa`, `abaa`, `aaba` and `aaab` all score 20.42% — the same
 *   number four times, from four different positions. That flatness is the
 *   lesson: while the case is wrong the score will not tell you where the
 *   character lives, and four guesses that all agree are four guesses saying
 *   "you are wrong about something other than the position". `Baaa` then
 *   doubles it, which names the case and the place in one move.
 *
 *   `Baaaa`, immediately after that double. It is the only beat where the
 *   player has real points to lose, which is the only moment a length penalty
 *   means anything: 40.85% to 32.95% for one character of padding.
 *
 *   `aaax` and `aaXa`, which both score 13.38% — exactly half of `aaxa`. Wrong
 *   place with the right case and right place with the wrong case are worth
 *   exactly the same, so the score refuses to say which mistake you made. That
 *   is the clearest possible demonstration of why one number is hard to read,
 *   and it arrives right after the player has been using the numbers
 *   confidently.
 */
function beats(): Beat[] {
  return [
    // ---- How long is it? --------------------------------------------------
    {
      guess: "000",
      hint: "shorter",
      score: 1.41,
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
          amount, but we now know the password is longer than three. Ignore the
          score for now — the arrow is doing all the work in this movement.
        </>
      ),
    },
    {
      guess: "00000",
      hint: "longer",
      score: 1.39,
      ask: (
        <>
          Overshoot deliberately. Try <Key>00000</Key> — five of them.
        </>
      ),
      learn: (
        <>
          <strong className="text-sky">Too long.</strong> So it is four:
          longer than three and shorter than five, and there is only one number
          in between. Two guesses, and the length is settled without the score
          being consulted once.
        </>
      ),
      mood: "sly",
    },
    {
      guess: "0000",
      hint: "exact",
      score: 1.41,
      ask: (
        <>
          Split the difference: <Key>0000</Key>.
        </>
      ),
      learn: (
        <>
          <strong className="text-mark-green">Right length — four characters.</strong>{" "}
          Every guess from here is four long — bar one, later, to show you what
          happens if it isn&apos;t. And the score is telling us something as
          well, quietly: it is not zero, so a <Key>0</Key> is in this password
          somewhere.
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
      score: 0.7,
      ask: (
        <>
          Use the blank. One <Key>0</Key> at the front, padded out:{" "}
          <Key>0aaa</Key>. Now the score is about that single character.
        </>
      ),
      learn: (
        <>
          0.7% — real, and lower than the 1.4% four of them scored. The{" "}
          <Key>0</Key> is in the password and it is <strong>not</strong> in the
          first position. A character in the wrong place still scores; it just
          scores less.
        </>
      ),
    },
    {
      guess: "a0aa",
      hint: "exact",
      score: 1.41,
      ask: (
        <>
          Move it one along: <Key>a0aa</Key>.
        </>
      ),
      learn: (
        <>
          <strong className="text-brass-bright">0.7% to 1.4%.</strong> Exactly
          double, from moving one character one place. That is the shape to
          learn, and it is the same shape everywhere on the board:{" "}
          <strong>a character in its right place pays twice what the same
          character pays anywhere else.</strong>
          <br />
          <br />
          Never mind that the numbers are small — you are not comparing them to
          anything but each other. The second character is <Key>0</Key>.
        </>
      ),
      mood: "cheer",
    },

    // ---- What are the letters? --------------------------------------------
    {
      guess: "baaa",
      hint: "exact",
      score: 20.42,
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
          20.4%. Not nothing — so <Key>b</Key> <em>is</em> in the password. Hold
          that number; the next three guesses are what make it mean something.
        </>
      ),
    },
    {
      guess: "abaa",
      hint: "exact",
      score: 20.42,
      ask: (
        <>
          Same character, next position: <Key>abaa</Key>.
        </>
      ),
      learn: <>20.4%. Identical. Keep going.</>,
    },
    {
      guess: "aaba",
      hint: "exact",
      score: 20.42,
      ask: (
        <>
          And again: <Key>aaba</Key>.
        </>
      ),
      learn: <>20.4% again. Not a flicker.</>,
    },
    {
      guess: "aaab",
      hint: "exact",
      score: 20.42,
      ask: (
        <>
          Last position: <Key>aaab</Key>.
        </>
      ),
      learn: (
        <>
          20.4% a fourth time.{" "}
          <strong className="text-brass-bright">
            Four positions, one number, no doubling anywhere.
          </strong>
          <br />
          <br />
          We know what a character in its right place does — it doubles. Nothing
          doubled, so on this evidence the <Key>b</Key> is in none of the four
          positions. It is also definitely in the password. Both cannot be true.
          <br />
          <br />
          So the guess is wrong about something that isn&apos;t position, and
          there is only one other thing a character can be wrong about.
        </>
      ),
      mood: "sly",
    },
    {
      guess: "Baaa",
      hint: "exact",
      score: 40.85,
      ask: (
        <>
          Test it. Back to the first position, capital letter: <Key>Baaa</Key>.
        </>
      ),
      learn: (
        <>
          <strong className="text-brass-bright">20.4% to 40.9%.</strong> Exactly
          double, for holding down shift — and a double is a character standing
          in its own position. It named the case and the place in one guess, and
          it explains the flat run: with the case wrong, the score will not tell
          you where a character lives. Fix the case first, then walk it.
          <br />
          <br />
          Two of four: the password starts <Key>B0</Key>.
        </>
      ),
      mood: "cheer",
    },
    {
      guess: "Baaaa",
      hint: "longer",
      score: 32.95,
      ask: (
        <>
          One detour, while there is finally something to lose. Add a single
          character of padding to that same guess: <Key>Baaaa</Key>.
        </>
      ),
      learn: (
        <>
          <strong className="text-berry">40.9% down to 33%.</strong> Nothing was
          taken away — the <Key>B</Key> is still first and still correct — and
          the score fell by a fifth. A score is a share of the whole guess, so
          padding past the real length dilutes every point you are holding.
          <br />
          <br />
          Long guesses are never free, and they get more expensive the better
          you are doing. Back to four.
        </>
      ),
      mood: "sly",
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
      score: 26.76,
      ask: (
        <>
          A little bird says skip ahead. <Key>xxxx</Key>.
        </>
      ),
      learn: (
        <>
          <strong className="text-brass-bright">26.8%.</strong> There is an{" "}
          <Key>x</Key> in there. We don&apos;t know where yet — four of them
          cover every position at once.
        </>
      ),
      mood: "cheer",
    },
    {
      guess: "aaxa",
      hint: "exact",
      score: 26.76,
      ask: (
        <>
          We already own positions one and two, so the <Key>x</Key> is in three
          or four. Test three: <Key>aaxa</Key>.
        </>
      ),
      learn: (
        <>
          26.8% — the same score, from a single <Key>x</Key> instead of four.
          One character is doing all of that work. Hold the number.
        </>
      ),
      mood: "cheer",
    },
    {
      guess: "aaax",
      hint: "exact",
      score: 13.38,
      ask: (
        <>
          Prove it by breaking it. Move the <Key>x</Key> along one:{" "}
          <Key>aaax</Key>.
        </>
      ),
      learn: (
        <>
          <strong className="text-brass-bright">Straight down to 13.4%</strong> —
          exactly half. Halving is doubling read backwards: the character just
          left its own position. Position three it is.
        </>
      ),
    },
    {
      guess: "aaXa",
      hint: "exact",
      score: 13.38,
      ask: (
        <>
          One thing left to check about it. Capitalise it: <Key>aaXa</Key>.
        </>
      ),
      learn: (
        <>
          13.4% again — and that is worth noticing. Wrong place with the right
          case, and right place with the wrong case, are worth{" "}
          <em>exactly the same</em>. Both are one step away, so the score
          refuses to tell you which step. Only the 26.8% was unique, so the
          lowercase <Key>x</Key> in position three stands.
          <br />
          <br />
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
      score: 30.99,
      ask: (
        <>
          Try the loud one: <Key>!!!!</Key>.
        </>
      ),
      learn: (
        <>
          <strong className="text-brass-bright">31%.</strong> There it is. And
          there is only one position left for it to be in, so there is nothing
          left to walk.
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
        Twenty guesses, no power-ups, and nothing spent. On a real safe that
        money is sent to your bank account{" "}
        <strong className="text-brass-bright">within 24 hours</strong>.
      </p>
    </div>
  );
}
