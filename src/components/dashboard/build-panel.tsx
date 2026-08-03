"use client";

// Building a spendbox.
//
// Two decisions and no more: what the password is, and how much is behind it.
// Everything else — the guess budget, the prize, our cut, the share link —
// falls out of those two, and the form shows each one changing as it's typed
// so nobody discovers the stake at the checkout.

import { useMemo, useState } from "react";
import { Dice5, Eye, EyeOff } from "lucide-react";
import {
  ALPHABET,
  ALPHABET_SET,
  BLURB_MAX,
  MAX_LENGTH,
  MIN_LENGTH,
  TITLE_MAX,
  guessesFor,
} from "@/lib/constants";
import { formatNaira, minStakeKobo, splitStake, stakeSchedule } from "@/lib/game/stakes";
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
  const [stakeNaira, setStakeNaira] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = useMemo(
    () =>
      secret
        .toUpperCase()
        .split("")
        .filter((ch) => ALPHABET_SET.has(ch))
        .join(""),
    [secret]
  );

  const length = clean.length;
  const valid = length >= MIN_LENGTH && length <= MAX_LENGTH;
  const floor = valid ? minStakeKobo(length) : 0;
  const stakeKobo = Math.round(Number(stakeNaira || 0) * 100);
  const split = splitStake(Math.max(stakeKobo, floor));

  async function build() {
    if (!valid) {
      setError(`The password needs ${MIN_LENGTH}–${MAX_LENGTH} characters.`);
      return;
    }
    if (stakeKobo < floor) {
      setError(`A ${length}-character password needs at least ${formatNaira(floor)}.`);
      return;
    }

    setBusy(true);
    setError(null);
    const res = await fetch("/api/contributor/boxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), blurb: blurb.trim(), secret: clean, stakeKobo }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      boxId?: string;
      error?: string;
      minStakeKobo?: number;
    };

    if (!res.ok || !body.boxId) {
      setBusy(false);
      setError(
        body.error === "stake_too_low"
          ? `That's below the floor for ${length} characters (${formatNaira(body.minStakeKobo ?? floor)}).`
          : body.error === "no_profile"
            ? "Pick a display name first."
            : "Couldn't create that box. Check the details and try again."
      );
      return;
    }

    // Straight to checkout: an unfunded box isn't a box, it's an intention.
    const fund = await fetch(`/api/contributor/boxes/${body.boxId}/fund`, { method: "POST" });
    const fundBody = (await fund.json().catch(() => ({}))) as {
      authorizationUrl?: string;
      error?: string;
    };
    if (fund.ok && fundBody.authorizationUrl) {
      window.location.assign(fundBody.authorizationUrl);
      return;
    }

    setBusy(false);
    onBuilt();
    setError(
      fundBody.error === "payments_unavailable"
        ? "The box is saved, but payments aren't switched on — it stays unfunded for now."
        : "The box is saved. Fund it from the Boxes tab to put it live."
    );
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
              className={`${INPUT} pr-20 font-mono tracking-[0.2em]`}
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
                  setSecret(suggest(length >= MIN_LENGTH ? length : 5));
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
            {MIN_LENGTH}–{MAX_LENGTH} characters from A–Z and{" "}
            <span className="font-mono">! @ # $ % &amp; * ? + =</span>. Anything else
            is dropped.
            {length > 0 && (
              <>
                {" "}
                <span className="text-zinc-300">
                  {length} character{length === 1 ? "" : "s"}
                </span>
                {valid && ` — players get ${guessesFor(length)} guesses an attempt.`}
              </>
            )}
          </p>

          <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-500">
            Nobody at Spendbox reads this back to you — not even on this page
            once you leave it. Keep your own copy.
          </p>
        </div>
      </Panel>

      <Panel title="The stake">
        <div className="space-y-3">
          <div className="relative">
            <span className="absolute inset-y-0 left-4 flex items-center text-zinc-500">₦</span>
            <input
              inputMode="numeric"
              value={stakeNaira}
              onChange={(e) => setStakeNaira(e.target.value.replace(/[^\d]/g, ""))}
              placeholder={valid ? String(Math.round(floor / 100)) : "Pick a password first"}
              className={`${INPUT} pl-8 font-mono`}
            />
          </div>

          {valid && (
            <dl className="grid grid-cols-3 gap-2 text-center">
              <Split label="You stake" value={formatNaira(split.stakeKobo)} />
              <Split label="Prize" value={formatNaira(split.prizeKobo)} accent />
              <Split label="Spendbox keeps" value={formatNaira(split.platformKobo)} />
            </dl>
          )}

          <p className="text-xs text-zinc-500">
            {valid
              ? `A ${length}-character password needs at least ${formatNaira(floor)}. Stake more for a bigger prize.`
              : "The floor rises with the password's length."}
          </p>
        </div>
      </Panel>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button type="button" disabled={busy} onClick={() => void build()} className={`w-full ${PRIMARY}`}>
        {busy ? "Working…" : valid ? `Stake ${formatNaira(Math.max(stakeKobo, floor))}` : "Build it"}
      </button>

      <p className="text-center text-xs text-zinc-500">
        You earn 70% of every power-up a player buys attacking this box — that&apos;s
        the part that comes back to you.
      </p>

      <StakeLadder />
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
function StakeLadder() {
  const [open, setOpen] = useState(false);
  const rows = stakeSchedule();

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="panel rounded-2xl p-5"
    >
      <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-zinc-400">
        What each length costs
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="pb-2 font-medium">Characters</th>
              <th className="pb-2 font-medium">Minimum stake</th>
              <th className="pb-2 font-medium">Prize at the floor</th>
            </tr>
          </thead>
          <tbody className="font-mono text-zinc-300">
            {rows.map((row) => (
              <tr key={row.length} className="border-t border-white/5">
                <td className="py-1.5">{row.length}</td>
                <td className="py-1.5">{formatNaira(row.minStakeKobo)}</td>
                <td className="py-1.5 text-brass">
                  {formatNaira(splitStake(row.minStakeKobo).prizeKobo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
