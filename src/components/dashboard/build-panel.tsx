"use client";

// Building a spendbox.
//
// Two decisions and no more: what the password is, and how much is behind it.
// Everything else — the reward, our cut, the difficulty, how long players will
// be at it — falls out of those two, and the form shows each one changing as
// it's typed. Nobody should discover what they've built at the checkout.
//
// A box lands as a **draft**: nothing is charged and nothing is published until
// it's funded, so a password is worth rewriting a few times first.

import { useMemo, useState } from "react";
import { Dice5, Eye, EyeOff, TriangleAlert } from "lucide-react";
import {
  ALPHABET,
  ALPHABET_SET,
  BLURB_MAX,
  MAX_LENGTH,
  MIN_LENGTH,
  TITLE_MAX,
} from "@/lib/constants";
import {
  formatNaira,
  fundingSchedule,
  minFundingKobo,
  splitFunding,
} from "@/lib/game/rewards";
import {
  bruteForceCostKobo,
  daysOfFreeLives,
  difficultyOf,
  estimateAttempts,
  estimateAttemptsWithBreakdown,
  freeTime,
  roughly,
} from "@/lib/game/difficulty";
import { RevenueEstimate } from "./revenue-estimate";
import { INPUT, Panel, PRIMARY } from "./shared";

/** A suggested password. Generated in the browser: it's only a suggestion, and
 * the real one is whatever the contributor submits. */
function suggest(length: number): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => ALPHABET[n % ALPHABET.length]).join("");
}

export function BuildPanel({ onBuilt }: { onBuilt: () => void }) {
  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [secret, setSecret] = useState("");
  const [fundingNaira, setFundingNaira] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Characters outside the alphabet are shown as rejected rather than silently
  // dropped — quietly altering somebody's password would be the worst thing
  // this form could do.
  const rejected = useMemo(
    () => [...new Set(secret.split("").filter((ch) => !ALPHABET_SET.has(ch)))],
    [secret]
  );
  const clean = useMemo(
    () => secret.split("").filter((ch) => ALPHABET_SET.has(ch)).join(""),
    [secret]
  );

  const length = clean.length;
  const valid = length >= MIN_LENGTH && length <= MAX_LENGTH && rejected.length === 0;
  const floor = length >= MIN_LENGTH ? minFundingKobo(Math.min(length, MAX_LENGTH)) : 0;
  const fundingKobo = Math.round(Number(fundingNaira || 0) * 100);
  const split = splitFunding(Math.max(fundingKobo, floor));

  const attempts = valid ? estimateAttempts(length) : 0;
  const bruteCost = valid ? bruteForceCostKobo(length) : 0;
  const underpriced = valid && split.rewardKobo > bruteCost;

  async function build() {
    if (!valid) {
      setError(`The password needs ${MIN_LENGTH}–${MAX_LENGTH} usable characters.`);
      return;
    }
    if (fundingKobo < floor) {
      setError(`A ${length}-character password needs at least ${formatNaira(floor)}.`);
      return;
    }

    setBusy(true);
    setError(null);
    const res = await fetch("/api/contributor/boxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        blurb: blurb.trim(),
        secret: clean,
        fundingKobo,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      boxId?: string;
      error?: string;
      minFundingKobo?: number;
    };
    setBusy(false);

    if (!res.ok || !body.boxId) {
      setError(
        body.error === "funding_too_low"
          ? `That's below the floor for ${length} characters (${formatNaira(body.minFundingKobo ?? floor)}).`
          : body.error === "no_profile"
            ? "Pick a display name first."
            : "Couldn't create that box. Check the details and try again."
      );
      return;
    }

    setTitle("");
    setBlurb("");
    setSecret("");
    setFundingNaira("");
    onBuilt();
  }

  return (
    <div className="space-y-4">
      <Panel title="The box">
        <div className="space-y-3">
          <input
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Name it — “The Friday Safe”"
            className={INPUT}
          />
          <textarea
            value={blurb}
            maxLength={BLURB_MAX}
            rows={2}
            onChange={(e) => setBlurb(e.target.value)}
            placeholder="One line for the card. Optional."
            className={`${INPUT} resize-none`}
          />
        </div>
      </Panel>

      <Panel title="The password">
        <div className="space-y-2">
          <div className="relative">
            <input
              type={reveal ? "text" : "password"}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Type it, or roll one"
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              className={`${INPUT} pr-20 font-mono tracking-[0.15em]`}
            />
            <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-2">
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                aria-label={reveal ? "Hide" : "Show"}
                className="flex size-8 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300"
              >
                {reveal ? (
                  <EyeOff className="size-4" aria-hidden />
                ) : (
                  <Eye className="size-4" aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSecret(suggest(length >= MIN_LENGTH ? length : 8));
                  setReveal(true);
                }}
                aria-label="Suggest a password"
                className="flex size-8 items-center justify-center rounded-lg text-zinc-500 hover:text-brass"
              >
                <Dice5 className="size-4" aria-hidden />
              </button>
            </div>
          </div>

          <p className="text-xs text-zinc-500">
            {MIN_LENGTH}–{MAX_LENGTH} characters. Letters, digits and{" "}
            <span className="font-mono">! @ # $ % &amp; * ? + = - _</span>.{" "}
            <strong className="text-zinc-300">Case matters</strong> — players have to
            get it exactly right.
            {length > 0 && (
              <>
                {" "}
                <span className="text-zinc-300">
                  {length} character{length === 1 ? "" : "s"}
                </span>
              </>
            )}
          </p>

          {rejected.length > 0 && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
              These aren&apos;t allowed and would change your password:{" "}
              <span className="font-mono">{rejected.join(" ")}</span>. Remove them.
            </p>
          )}

          <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-500">
            Nobody at Spendbox can read this back to you — not even on this page
            once you leave it. Keep your own copy.
          </p>
        </div>
      </Panel>

      {valid && (
        <Panel title="What you're building">
          <div className="grid gap-2 sm:grid-cols-3">
            <Figure label="Difficulty" value={difficultyOf(length)} />
            <Figure label="Attempts to crack" value={roughly(attempts)} />
            <Figure
              label="On free lives"
              value={freeTime(daysOfFreeLives(attempts))}
            />
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            A methodical player finds the length first, then works one position at
            a time. Because a guess comes back as a single percentage and the
            arithmetic behind it is never disclosed, the only safe reading of a
            position is to try every character and keep the best — which is why
            the number is what it is. A player who buys Colour Read roughly
            halves it, to about{" "}
            {roughly(estimateAttemptsWithBreakdown(length))}.
          </p>

          <RevenueEstimate hunters={0} earnedKobo={0} launched={false} />
        </Panel>
      )}

      <Panel title="The reward">
        <div className="space-y-3">
          <div className="relative">
            <span className="absolute inset-y-0 left-4 flex items-center text-zinc-500">₦</span>
            <input
              inputMode="numeric"
              value={fundingNaira}
              onChange={(e) => setFundingNaira(e.target.value.replace(/[^\d]/g, ""))}
              placeholder={
                valid ? String(Math.round(floor / 100)) : "Write a password first"
              }
              className={`${INPUT} pl-8 font-mono`}
            />
          </div>

          {valid && (
            <dl className="grid grid-cols-3 gap-2 text-center">
              <Split label="You pay" value={formatNaira(split.fundingKobo)} />
              <Split label="Reward" value={formatNaira(split.rewardKobo)} accent />
              <Split label="Spendbox keeps" value={formatNaira(split.platformKobo)} />
            </dl>
          )}

          <p className="text-xs text-zinc-500">
            {valid
              ? `A ${length}-character password needs at least ${formatNaira(floor)}. Put up more for a bigger reward — and you can raise it later, but never lower it.`
              : "The floor rises with the password's length."}
          </p>

          {underpriced && (
            <p className="flex items-start gap-2 rounded-lg bg-mark-orange/10 px-3 py-2.5 text-xs text-mark-orange">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Worth knowing: a systematic player needs about{" "}
                <strong>{formatNaira(bruteCost)}</strong> of lives to work through
                this box, and the reward is{" "}
                <strong>{formatNaira(split.rewardKobo)}</strong> — so a patient one
                comes out ahead. A longer password or a smaller reward closes the
                gap.
              </span>
            </p>
          )}
        </div>
      </Panel>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="button"
        disabled={busy}
        onClick={() => void build()}
        className={`w-full ${PRIMARY}`}
      >
        {busy ? "Saving…" : "Save as draft"}
      </button>

      <p className="text-center text-xs text-zinc-500">
        Drafts are free, invisible and editable. You fund it from the Boxes tab
        when you&apos;re happy — and after that the password is fixed and the box
        can never be deleted.
      </p>

      <FundingLadder />
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2.5 text-center">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-zinc-200">{value}</p>
    </div>
  );
}

function Split({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-white/5 px-2 py-2.5">
      <dt className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd
        className={
          "mt-0.5 font-mono text-sm font-bold " + (accent ? "text-brass" : "text-zinc-200")
        }
      >
        {value}
      </dd>
    </div>
  );
}

/** The whole ladder, so the next step up is never a surprise at checkout. */
function FundingLadder() {
  return (
    <details className="panel rounded-2xl p-5">
      <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-zinc-400">
        What each length costs
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="pb-2 font-medium">Characters</th>
              <th className="pb-2 font-medium">Minimum</th>
              <th className="pb-2 font-medium">Reward</th>
              <th className="pb-2 font-medium">Attempts</th>
            </tr>
          </thead>
          <tbody className="font-mono text-zinc-300">
            {fundingSchedule().map((row) => (
              <tr key={row.length} className="border-t border-white/5">
                <td className="py-1.5">{row.length}</td>
                <td className="py-1.5">{formatNaira(row.minFundingKobo)}</td>
                <td className="py-1.5 text-brass">
                  {formatNaira(splitFunding(row.minFundingKobo).rewardKobo)}
                </td>
                <td className="py-1.5 text-zinc-500">
                  {roughly(estimateAttempts(row.length))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
