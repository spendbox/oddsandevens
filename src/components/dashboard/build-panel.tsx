"use client";

// Building a spendbox.
//
// It used to be one long form: four fieldsets stacked down a page, every one of
// them open, every one of them shouting. That is a bad shape for a decision
// with real money at the end of it — you cannot see what you have decided
// because everything you have not decided is in the way.
//
// So: four cards. Each says what it is, what you have chosen, and whether it is
// done. Tapping one opens a dialog with the whole of that decision in it and
// nothing else. The page you come back to is a summary you can read at a
// glance, and the button at the bottom only lights up when the summary is
// complete.
//
// A box lands as a **draft**: nothing is charged and nothing is published until
// it's funded, so a password is worth rewriting a few times first.

import { useMemo, useState } from "react";
import {
  Check,
  Dice5,
  Eye,
  EyeOff,
  Palette,
  Pencil,
  Tag,
  Vault,
  Wallet,
} from "lucide-react";
import {
  BLURB_MAX,
  KOBO,
  MAX_FUNDING_KOBO,
  MAX_LENGTH,
  MIN_LENGTH,
  TITLE_MAX,
} from "@/lib/constants";
import {
  formatNaira,
  fundingSchedule,
  minFundingKobo,
  splitFunding,
  type FundingLadder,
} from "@/lib/game/rewards";
import { useFundingLadder } from "@/components/use-funding";
import { difficultyOf } from "@/lib/game/difficulty";
import { DESIGNS, DESIGN_SPECS, DEFAULT_DESIGN, type Design } from "@/lib/game/designs";
import { Modal } from "@/components/ui/modal";
import { SafeArt } from "@/components/safe/safe-art";
import { CharsetDialog, useAlphabet } from "@/components/charset-dialog";
import { RevenueEstimate } from "./revenue-estimate";
import { INPUT, Panel, PRIMARY } from "./shared";

/**
 * Digits only, no leading zeros, never above the platform ceiling.
 *
 * Clamping the *value* rather than the number of digits, because "10000001" and
 * "99999999" are both eight characters and only one of them is over the line.
 */
function capFunding(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return "";
  const naira = Math.min(Number(digits), MAX_FUNDING_KOBO / KOBO);
  return String(naira);
}

/** A suggested password. Generated in the browser: it's only a suggestion, and
 * the real one is whatever the contributor submits. Drawn from the alphabet in
 * force, so a suggestion is never something the server would then refuse. */
function suggest(length: number, alphabet: string[]): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join("");
}

type Card = "box" | "password" | "reward" | "design" | null;

export function BuildPanel({ onBuilt }: { onBuilt: () => void }) {
  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [secret, setSecret] = useState("");
  const [fundingNaira, setFundingNaira] = useState("");
  const [design, setDesign] = useState<Design>(DEFAULT_DESIGN);
  const [card, setCard] = useState<Card>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Characters outside the alphabet are shown as rejected rather than silently
  // dropped — quietly altering somebody's password would be the worst thing
  // this form could do. The alphabet is a setting now, so it is read rather
  // than imported: what this field accepts is what the create route accepts.
  const alphabet = useAlphabet();
  const allowed = useMemo(() => new Set(alphabet.alphabet), [alphabet]);
  const rejected = useMemo(
    () => [...new Set(secret.split("").filter((ch) => !allowed.has(ch)))],
    [secret, allowed]
  );
  const clean = useMemo(
    () => secret.split("").filter((ch) => allowed.has(ch)).join(""),
    [secret, allowed]
  );

  // The floor is a setting too, so it is read rather than imported — what this
  // screen quotes is what the create route will accept.
  const ladder = useFundingLadder();

  const length = clean.length;
  const passwordOk = length >= MIN_LENGTH && length <= MAX_LENGTH && rejected.length === 0;
  const floor =
    length >= MIN_LENGTH ? minFundingKobo(Math.min(length, MAX_LENGTH), ladder) : 0;
  const fundingKobo = Math.round(Number(fundingNaira || 0) * 100);
  const split = splitFunding(Math.max(fundingKobo, floor));
  const titleOk = title.trim().length > 0;
  const rewardOk = passwordOk && fundingKobo >= floor && fundingKobo > 0;
  const atCeiling = fundingKobo >= MAX_FUNDING_KOBO;
  const ready = titleOk && passwordOk && rewardOk;

  async function build() {
    if (!ready) return;

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
        design,
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
    setDesign(DEFAULT_DESIGN);
    onBuilt();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <BuildCard
          icon={<Tag className="size-4" aria-hidden />}
          label="The box"
          value={titleOk ? title.trim() : "Give it a name"}
          done={titleOk}
          onOpen={() => setCard("box")}
        />
        <BuildCard
          icon={<Vault className="size-4" aria-hidden />}
          label="The password"
          value={
            passwordOk
              ? `${length} characters · ${difficultyOf(length)}`
              : "Write one, or roll one"
          }
          done={passwordOk}
          onOpen={() => setCard("password")}
        />
        <BuildCard
          icon={<Wallet className="size-4" aria-hidden />}
          label="The reward"
          value={
            rewardOk
              ? `${formatNaira(split.rewardKobo)} to whoever cracks it`
              : passwordOk
                ? `From ${formatNaira(floor)}`
                : "Write the password first"
          }
          done={rewardOk}
          onOpen={() => {
            if (!passwordOk) return;
            // Opening it empty means typing the minimum from scratch, every
            // time, on a field where the minimum is the answer most of the
            // time. Pre-filled with the floor for the length just written.
            if (!fundingNaira) setFundingNaira(String(Math.round(floor / KOBO)));
            setCard("reward");
          }}
          disabled={!passwordOk}
        />
        <BuildCard
          icon={<Palette className="size-4" aria-hidden />}
          label="The safe"
          value={DESIGN_SPECS[design].name}
          done
          art={<SafeArt design={design} className="size-9" />}
          onOpen={() => setCard("design")}
        />
      </div>

      {rewardOk && (
        <Panel title="What you're building">
          <RevenueEstimate rewardKobo={split.rewardKobo} hunters={0} earnedKobo={0} />
        </Panel>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="button"
        disabled={busy || !ready}
        onClick={() => void build()}
        className={`w-full ${PRIMARY}`}
      >
        {busy ? "Saving…" : ready ? "Save as draft" : "Fill in the cards above"}
      </button>

      <FundingLadderTable ladder={ladder} />

      {card === "box" && (
        <CardDialog title="The box" onClose={() => setCard(null)}>
          <label className="block">
            <span className="text-sm font-bold text-zinc-300">Name</span>
            <input
              value={title}
              maxLength={TITLE_MAX}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Friday Safe"
              className={`${INPUT} mt-1.5`}
            />
            <span className="mt-1 block text-right text-xs text-zinc-400">
              {title.length}/{TITLE_MAX}
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-zinc-300">One line for the card</span>
            <textarea
              value={blurb}
              maxLength={BLURB_MAX}
              rows={3}
              onChange={(e) => setBlurb(e.target.value)}
              placeholder="Optional. Say something that makes people want a go."
              className={`${INPUT} mt-1.5 resize-none`}
            />
            <span className="mt-1 block text-right text-xs text-zinc-400">
              {blurb.length}/{BLURB_MAX}
            </span>
          </label>
        </CardDialog>
      )}

      {card === "password" && (
        <PasswordCard
          secret={secret}
          setSecret={setSecret}
          clean={clean}
          rejected={rejected}
          alphabet={alphabet}
          onClose={() => setCard(null)}
        />
      )}

      {card === "reward" && (
        <CardDialog title="The reward" onClose={() => setCard(null)}>
          <div className="relative">
            <span className="absolute inset-y-0 left-4 flex items-center text-zinc-400">₦</span>
            <input
              inputMode="numeric"
              autoFocus
              value={fundingNaira}
              // Digits only, no leading zeros, and hard-stopped at the ceiling.
              // Paystack will not move more than ₦10,000,000 in one transfer,
              // so a figure above it is a box that can never pay out — better
              // refused at the keystroke than at the checkout.
              onChange={(e) => setFundingNaira(capFunding(e.target.value))}
              placeholder={String(Math.round(floor / KOBO))}
              className={`${INPUT} mt-1.5 pl-8 font-mono`}
            />
          </div>

          {atCeiling && (
            <p className="rounded-lg bg-brass/10 px-3 py-2 text-sm text-brass">
              {formatNaira(MAX_FUNDING_KOBO)} is the most a single box can hold —
              it’s the largest transfer Paystack will make in one go.
            </p>
          )}

          <dl className="grid grid-cols-3 gap-2 text-center">
            <SplitTile label="You pay" value={formatNaira(split.fundingKobo)} />
            <SplitTile label="Reward" value={formatNaira(split.rewardKobo)} accent />
            <SplitTile label="Spendbox keeps" value={formatNaira(split.platformKobo)} />
          </dl>

          <p className="text-sm text-zinc-500">
            At least {formatNaira(floor)} for {length} characters. You can raise
            it later, but never lower it.
          </p>
        </CardDialog>
      )}

      {card === "design" && (
        <CardDialog title="The safe" onClose={() => setCard(null)}>
          <p className="text-sm text-zinc-500">
            Decoration, and only decoration — it changes nothing about the game.
            It’s what people see on the card, the share link and the screen
            they spend a fortnight staring at.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {DESIGNS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setDesign(key)}
                className={
                  "flex flex-col items-center gap-1 rounded-xl border-2 p-2 transition " +
                  (design === key
                    ? "border-brass bg-brass/5"
                    : "border-white/12 bg-white/5 hover:border-white/30")
                }
              >
                <SafeArt design={key} className="size-14" />
                <span className="text-xs font-bold text-zinc-300">
                  {DESIGN_SPECS[key].name}
                </span>
              </button>
            ))}
          </div>
          <p className="text-sm text-zinc-500">{DESIGN_SPECS[design].note}</p>
        </CardDialog>
      )}
    </div>
  );
}


/**
 * One decision, closed.
 *
 * The tick is the whole point: four cards, four ticks, and the button at the
 * bottom is honest about being disabled because you can see exactly which one
 * is missing.
 */
export function BuildCard({
  icon,
  label,
  value,
  done,
  art,
  disabled,
  onOpen,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  done: boolean;
  art?: React.ReactNode;
  disabled?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onOpen}
      className={
        "panel flex items-center gap-3 rounded-2xl p-4 text-left transition " +
        (disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:-translate-y-0.5 hover:border-brass/40")
      }
    >
      {art ?? (
        <span
          className={
            "flex size-9 shrink-0 items-center justify-center rounded-lg " +
            (done ? "bg-mark-green/15 text-mark-green" : "bg-white/5 text-zinc-500")
          }
        >
          {done ? <Check className="size-4" aria-hidden /> : icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] uppercase tracking-wide text-zinc-500">
          {label}
        </span>
        <span
          className={
            "block truncate text-sm font-medium " +
            (done ? "text-zinc-100" : "text-zinc-500")
          }
        >
          {value}
        </span>
      </span>
      <Pencil className="size-4 shrink-0 text-zinc-600" aria-hidden />
    </button>
  );
}

export function CardDialog({
  title,
  onClose,
  /**
   * Reason the card cannot be finished yet, or null when it can.
   *
   * On the button rather than as a validation message after the fact: a card
   * that closes on an unusable answer just moves the error to the step behind
   * it, where it is somebody else's problem to notice.
   */
  blocked = null,
  children,
}: {
  title: string;
  onClose: () => void;
  blocked?: string | null;
  children: React.ReactNode;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={!!blocked}
          onClick={onClose}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky w-full rounded-2xl bg-brass px-4 py-3.5 text-ink"
        >
          {blocked ?? "Done"}
        </button>
      }
    >
      <div className="space-y-4 pb-1">{children}</div>
    </Modal>
  );
}

function PasswordCard({
  secret,
  setSecret,
  clean,
  rejected,
  alphabet,
  onClose,
}: {
  secret: string;
  setSecret: (next: string) => void;
  clean: string;
  rejected: string[];
  alphabet: ReturnType<typeof useAlphabet>;
  onClose: () => void;
}) {
  const [reveal, setReveal] = useState(false);
  const [chars, setChars] = useState(false);
  const length = clean.length;

  return (
    <CardDialog
      title="The password"
      onClose={onClose}
      blocked={
        length === 0
          ? `At least ${MIN_LENGTH} characters`
          : length < MIN_LENGTH
            ? `${MIN_LENGTH - length} more character${MIN_LENGTH - length === 1 ? "" : "s"}`
            : rejected.length > 0
              ? "Remove what isn't allowed"
              : null
      }
    >
      <div className="relative">
        <input
          type={reveal ? "text" : "password"}
          value={secret}
          autoFocus
          // Hard-stopped at the ceiling. `maxLength` covers typing; the slice
          // covers a paste, which `maxLength` doesn't always. Letting somebody
          // write 38 characters and only telling them afterwards was cruel.
          maxLength={MAX_LENGTH}
          onChange={(e) => setSecret(e.target.value.slice(0, MAX_LENGTH))}
          placeholder="Type it, or roll one"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          className={`${INPUT} mt-1.5 pr-20 font-mono tracking-[0.15em]`}
        />
        <div className="absolute inset-y-0 right-0 top-1 flex items-center gap-1 pr-2">
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Hide" : "Show"}
            className="flex size-8 items-center justify-center rounded-lg text-zinc-400 hover:text-foreground"
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
              setSecret(suggest(length >= MIN_LENGTH ? length : 8, alphabet.alphabet));
              setReveal(true);
            }}
            aria-label="Suggest a password"
            className="flex size-8 items-center justify-center rounded-lg text-zinc-400 hover:text-brass"
          >
            <Dice5 className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-zinc-500">
          {MIN_LENGTH}–{MAX_LENGTH} characters. Case matters.{" "}
          <button
            type="button"
            onClick={() => setChars(true)}
            className="font-bold text-brass underline underline-offset-2"
          >
            See all {alphabet.alphabet.length} you can use
          </button>
          .
        </span>
        <span className="shrink-0 font-mono text-zinc-300">
          {length > 0 ? `${length} · ${difficultyOf(length)}` : `0/${MAX_LENGTH}`}
        </span>
      </div>

      {rejected.length > 0 && (
        <p className="rounded-lg bg-berry/15 px-3 py-2 text-sm font-bold text-berry">
          Not allowed:{" "}
          <span className="font-mono">{rejected.join(" ")}</span>. Remove them.
        </p>
      )}

      <p className="rounded-lg bg-black/25 px-3 py-2.5 text-sm text-zinc-400">
        Nobody at Spendbox can read this back to you. Keep your own copy.
      </p>

      {chars && (
        <CharsetDialog alphabet={alphabet} creating onClose={() => setChars(false)} />
      )}
    </CardDialog>
  );
}


export function SplitTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl bg-black/25 px-2 py-2.5">
      <dt className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd
        className={
          "mt-0.5 font-mono text-sm font-bold " +
          (accent ? "text-brass" : "text-zinc-200")
        }
      >
        {value}
      </dd>
    </div>
  );
}

/** The whole ladder, so the next step up is never a surprise at checkout. */
function FundingLadderTable({ ladder }: { ladder: FundingLadder }) {
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
            </tr>
          </thead>
          <tbody className="font-mono text-zinc-300">
            {fundingSchedule(ladder).map((row) => (
              <tr key={row.length} className="border-t border-white/5">
                <td className="py-1.5">{row.length}</td>
                <td className="py-1.5">{formatNaira(row.minFundingKobo)}</td>
                <td className="py-1.5 text-brass">
                  {formatNaira(splitFunding(row.minFundingKobo).rewardKobo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export { INPUT };
