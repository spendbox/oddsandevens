"use client";

// The platform's own back room.
//
// It grew past one screen, so it is four: money, the people, the boxes, and
// our own box. Everything that runs itself still does — contributor payouts go
// through Paystack subaccounts and never need a human — and what's left here is
// the handful of things that genuinely need one.
//
//   Money    revenue by stream, and rewards waiting to be sent
//   Players  every address, what they've spent, what they've won
//   Boxes    every box, and the two irreversible things we can do to one
//   Ours     authoring the Spendbox-funded box

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  Lock,
  Palette,
  ShieldCheck,
  Tag,
  Star,
  Trash2,
  Users,
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
import { formatNaira, rewardLabel } from "@/lib/game/rewards";
import { difficultyOf } from "@/lib/game/difficulty";
import { DESIGNS, DESIGN_SPECS, DEFAULT_DESIGN, type Design } from "@/lib/game/designs";
import { SafeArt } from "@/components/safe/safe-art";
import { CharsetDialog, useAlphabet } from "@/components/charset-dialog";
import { BuildCard, CardDialog } from "@/components/dashboard/build-panel";
import { PayoutsPanel } from "@/components/admin/payouts-panel";
import { PricingPanel } from "@/components/admin/pricing-panel";
import { AlphabetPanel } from "@/components/admin/alphabet-panel";
import { LimitsPanel } from "@/components/admin/limits-panel";
import { GrantLives } from "@/components/admin/grant-lives";
import { UsersPanel } from "@/components/admin/users-panel";
import { DeleteBoxDialog } from "@/components/admin/delete-box-dialog";
import type { PublicBox } from "@/lib/types";

const INPUT =
  "field px-4 py-3";
const PRIMARY = "btn-chunky rounded-2xl bg-brass px-5 py-3.5 text-ink";

type Tab = "money" | "players" | "boxes" | "ours";

const TABS: { id: Tab; label: string; icon: typeof Wallet }[] = [
  { id: "money", label: "Money", icon: Wallet },
  { id: "players", label: "Players", icon: Users },
  { id: "boxes", label: "Boxes", icon: Vault },
  { id: "ours", label: "Our box", icon: ShieldCheck },
];

interface AdminBox extends PublicBox {
  id: string;
  fundingKobo: number;
  createdAt: string;
}

interface Claim {
  id: string;
  amountKobo: number;
  status: "unclaimed" | "submitted" | "paid";
  player: string;
  boxTitle: string;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  wonAt: string;
  paidAt: string | null;
}

interface Overview {
  revenue: {
    fundingCutKobo: number;
    powerUpPlatformKobo: number;
    lifeKobo: number;
    lifeGrossKobo: number;
    totalKobo: number;
    contributorKobo: number;
    livesSold: number;
    powerUpsSold: number;
  };
  boxes: { live: number; funding: number; unlocked: number; rewardsOwedKobo: number };
}

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [boxes, setBoxes] = useState<AdminBox[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tab, setTab] = useState<Tab>("money");
  const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/overview", { cache: "no-store" });
    if (res.status === 401) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    setOverview((await res.json()) as Overview);

    const [boxRes, claimRes] = await Promise.all([
      fetch("/api/admin/boxes", { cache: "no-store" }),
      fetch("/api/admin/claims", { cache: "no-store" }),
    ]);
    if (boxRes.ok) setBoxes(((await boxRes.json()) as { boxes: AdminBox[] }).boxes);
    if (claimRes.ok) setClaims(((await claimRes.json()) as { claims: Claim[] }).claims);
  }, []);

  useEffect(() => {
    async function run() {
      await load();
    }
    void run();
  }, [load]);

  if (authed === null) {
    return <p className="p-10 text-center text-sm text-zinc-500">Loading…</p>;
  }
  if (!authed) return <AdminLogin onIn={() => void load()} />;

  const owed = claims.filter((c) => c.status === "submitted");

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-6">
      <header className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-brass" aria-hidden />
        <h1 className="text-xl font-black tracking-tight">Spendbox admin</h1>
      </header>

      <div role="tablist" className="panel flex gap-1 rounded-2xl p-1.5">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm font-bold transition active:translate-y-px " +
              (tab === id
                ? "bg-brass text-ink shadow-[inset_0_1.5px_0_rgba(255,255,255,0.45),0_3px_0_var(--brass-deep)]"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100")
            }
          >
            <Icon className="size-4" aria-hidden />
            <span className="hidden sm:inline">{label}</span>
            {id === "money" && owed.length > 0 && (
              <span className="rounded-md bg-berry px-1.5 py-0.5 text-[10px] font-black text-ink">
                {owed.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "money" && (
        <>
          {overview && (
            <section className="grid gap-2 sm:grid-cols-4">
              <Figure label="Platform revenue" value={formatNaira(overview.revenue.totalKobo)} />
              <Figure
                label="From lives"
                value={formatNaira(overview.revenue.lifeKobo)}
                hint={`${overview.revenue.livesSold} sold, ${formatNaira(overview.revenue.lifeGrossKobo)} gross`}
              />
              <Figure
                label="From power-ups"
                value={formatNaira(overview.revenue.powerUpPlatformKobo)}
                hint={`${overview.revenue.powerUpsSold} sold`}
              />
              <Figure
                label="From funding"
                value={formatNaira(overview.revenue.fundingCutKobo)}
                hint={`${overview.boxes.live} live`}
              />
            </section>
          )}

          {overview && (
            <section className="grid gap-2 sm:grid-cols-2">
              <Figure
                label="Paid through to creators"
                value={formatNaira(overview.revenue.contributorKobo)}
              />
              <Figure
                label="Rewards owed to winners"
                value={formatNaira(overview.boxes.rewardsOwedKobo)}
                hint={`${overview.boxes.unlocked} cracked`}
              />
            </section>
          )}

          <section className="panel rounded-2xl p-5">
            <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-zinc-300">
              Rewards to send {owed.length > 0 && `(${owed.length})`}
            </h2>
            {claims.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-500">No rewards owed yet.</p>
            ) : (
              <ul className="space-y-2">
                {claims.map((claim) => (
                  <ClaimRow key={claim.id} claim={claim} onPaid={() => void load()} />
                ))}
              </ul>
            )}
          </section>

          <PayoutsPanel />

          <PricingPanel />

          <AlphabetPanel />

          <GrantLives />
        </>
      )}

      {tab === "players" && (
        <>
          <UsersPanel />
          <LimitsPanel />
        </>
      )}

      {tab === "boxes" && (
        <section className="panel rounded-2xl p-5">
          <h2 className="mb-1 text-sm font-black uppercase tracking-wide text-zinc-300">
            Every box
          </h2>
          <p className="mb-3 text-xs text-zinc-500">
            <strong className="text-zinc-300">Close</strong> takes a box off the
            board and leaves its history intact — that is the normal remedy.{" "}
            <strong className="text-zinc-300">Delete</strong> is permanent, takes
            every attempt with it, and asks for a code by email first.{" "}
            <strong className="text-zinc-300">Feature</strong> puts a live box at
            the top of the landing page — as many as you like, from either side,
            and cracking one clears it automatically.
          </p>
          <ul className="space-y-1.5">
            {boxes.map((box) => (
              <li
                key={box.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white/5 px-3 py-2.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {box.title}
                  <span className="ml-2 text-xs font-normal text-zinc-500">
                    {box.kind === "general" ? "ours" : (box.contributor ?? "a player")}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs text-brass">
                  {rewardLabel(box.rewardKobo)}
                </span>
                <span className="shrink-0 text-xs text-zinc-500">{box.status}</span>
                {box.status === "live" && (
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch("/api/admin/boxes", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ boxId: box.id, featured: !box.featured }),
                      });
                      void load();
                    }}
                    className={
                      "flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold transition active:translate-y-px " +
                      (box.featured
                        ? "bg-brass text-ink"
                        : "bg-white/6 text-zinc-300 hover:bg-white/12")
                    }
                  >
                    <Star
                      className={"size-3.5 " + (box.featured ? "fill-ink" : "")}
                      aria-hidden
                    />
                    {box.featured ? "Featured" : "Feature"}
                  </button>
                )}
                {["draft", "funding", "live"].includes(box.status) && (
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch("/api/admin/boxes", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ boxId: box.id }),
                      });
                      void load();
                    }}
                    className="shrink-0 rounded-lg bg-white/6 px-2 py-1 text-xs font-bold text-zinc-300 transition hover:bg-white/12 active:translate-y-px"
                  >
                    Close
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDeleting({ id: box.id, title: box.title })}
                  aria-label={`Delete ${box.title}`}
                  className="shrink-0 rounded-lg bg-berry/15 px-2 py-1 text-xs font-bold text-berry transition hover:bg-berry/25 active:translate-y-px"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "ours" && <GeneralBoxForm onCreated={() => void load()} />}

      {deleting && (
        <DeleteBoxDialog
          boxId={deleting.id}
          boxTitle={deleting.title}
          onClose={() => setDeleting(null)}
          onDeleted={() => void load()}
        />
      )}
    </div>
  );
}

function ClaimRow({ claim, onPaid }: { claim: Claim; onPaid: () => void }) {
  const [busy, setBusy] = useState(false);

  return (
    <li className="rounded-xl bg-white/5 px-3 py-2.5 text-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-zinc-200">
            {claim.boxTitle} — <span className="text-zinc-400">{claim.player}</span>
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {claim.status === "unclaimed"
              ? "Waiting on their bank details"
              : `${claim.accountName} · ${claim.bankName} · ${claim.accountNumber}`}
          </p>
        </div>
        <span className="shrink-0 font-mono text-brass">{formatNaira(claim.amountKobo)}</span>
      </div>

      {claim.status === "submitted" && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await fetch("/api/admin/claims", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ claimId: claim.id }),
            });
            setBusy(false);
            onPaid();
          }}
          className="mt-2 flex items-center gap-1.5 rounded-lg border border-mark-green/40 bg-mark-green/10 px-3 py-1.5 text-xs font-semibold text-mark-green transition hover:border-mark-green disabled:opacity-50"
        >
          <Check className="size-3.5" aria-hidden />
          {busy ? "Marking…" : "Tick when sent"}
        </button>
      )}
      {claim.status === "paid" && (
        <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-mark-green">
          <Check className="size-3.5" aria-hidden />
          Sent {claim.paidAt && new Date(claim.paidAt).toLocaleDateString()}
        </p>
      )}
    </li>
  );
}

function GeneralBoxForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [secret, setSecret] = useState("");
  const [rewardNaira, setRewardNaira] = useState("");
  const [design, setDesign] = useState<Design>(DEFAULT_DESIGN);
  const [card, setCard] = useState<"box" | "password" | "reward" | "design" | null>(null);
  const [chars, setChars] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Not upper-cased. Case is part of a password now, and quietly folding it
  // would make an admin box the one kind nobody could crack. The alphabet is
  // read rather than imported so this field and the create route agree.
  const alphabet = useAlphabet();
  const allowed = new Set(alphabet.alphabet);
  const rejected = [...new Set(secret.split("").filter((ch) => !allowed.has(ch)))];
  const clean = secret.split("").filter((ch) => allowed.has(ch)).join("");
  const length = clean.length;
  const passwordOk = length >= MIN_LENGTH && length <= MAX_LENGTH && rejected.length === 0;
  const titleOk = title.trim().length > 0;
  const rewardKobo = Math.round(Number(rewardNaira || 0) * KOBO);
  const ready = titleOk && passwordOk;

  async function create() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/boxes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        blurb: blurb.trim(),
        secret: clean,
        rewardKobo,
        design,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setTitle("");
      setBlurb("");
      setSecret("");
      setRewardNaira("");
      setDesign(DEFAULT_DESIGN);
      onCreated();
      return;
    }
    setError("Couldn't create that box. Check the fields.");
  }

  return (
    <section className="panel rounded-2xl p-5">
      <h2 className="text-sm font-black uppercase tracking-wide text-zinc-300">
        A Spendbox box
      </h2>
      <p className="mb-3 mt-1 text-xs text-zinc-500">
        The same four decisions a contributor makes, in the same four cards —
        with no checkout at the end of them. We fund these, so there is nothing
        to collect and no split. Leave the reward blank for a pure challenge.
      </p>

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
            passwordOk ? `${length} characters · ${difficultyOf(length)}` : "Write one, or roll one"
          }
          done={passwordOk}
          onOpen={() => setCard("password")}
        />
        <BuildCard
          icon={<Wallet className="size-4" aria-hidden />}
          label="The reward"
          value={rewardKobo > 0 ? rewardLabel(rewardKobo) : "A pure challenge"}
          done
          onOpen={() => setCard("reward")}
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

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <button
        type="button"
        disabled={busy || !ready}
        onClick={() => void create()}
        style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
        className={`mt-3 ${PRIMARY}`}
      >
        {busy ? "Creating…" : ready ? "Put it live" : "Fill in the cards above"}
      </button>

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
              rows={2}
              onChange={(e) => setBlurb(e.target.value)}
              placeholder="Optional."
              className={`${INPUT} mt-1.5 resize-none`}
            />
            <span className="mt-1 block text-right text-xs text-zinc-400">
              {blurb.length}/{BLURB_MAX}
            </span>
          </label>
        </CardDialog>
      )}

      {card === "password" && (
        <CardDialog title="The password" onClose={() => setCard(null)}>
          <div className="flex gap-2">
            <input
              value={secret}
              autoFocus
              maxLength={MAX_LENGTH}
              onChange={(e) => setSecret(e.target.value.slice(0, MAX_LENGTH))}
              placeholder="Type it, or roll one"
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              className={`${INPUT} font-mono tracking-[0.15em]`}
            />
            <button
              type="button"
              onClick={() => {
                const bytes = new Uint32Array(10);
                crypto.getRandomValues(bytes);
                setSecret(
                  Array.from(
                    bytes,
                    (n) => alphabet.alphabet[n % alphabet.alphabet.length]
                  ).join("")
                );
              }}
              className="shrink-0 rounded-xl border border-white/10 px-3 text-sm text-zinc-400 hover:border-brass/40"
            >
              Roll
            </button>
          </div>

          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-zinc-500">
              {MIN_LENGTH}–{MAX_LENGTH} characters. Case matters.{" "}
              <button
                type="button"
                onClick={() => setChars(true)}
                className="font-bold text-brass underline underline-offset-2"
              >
                See all {alphabet.alphabet.length}
              </button>
              .
            </span>
            <span className="shrink-0 font-mono text-zinc-300">
              {length > 0 ? `${length} · ${difficultyOf(length)}` : `0/${MAX_LENGTH}`}
            </span>
          </div>

          {rejected.length > 0 && (
            <p className="rounded-lg bg-berry/15 px-3 py-2 text-sm font-bold text-berry">
              Not allowed: <span className="font-mono">{rejected.join(" ")}</span>. Remove them.
            </p>
          )}

          {chars && (
            <CharsetDialog alphabet={alphabet} creating onClose={() => setChars(false)} />
          )}
        </CardDialog>
      )}

      {card === "reward" && (
        <CardDialog title="The reward" onClose={() => setCard(null)}>
          <div className="relative">
            <span className="absolute inset-y-0 left-4 flex items-center text-zinc-400">₦</span>
            <input
              inputMode="numeric"
              autoFocus
              value={rewardNaira}
              onChange={(e) => setRewardNaira(capNaira(e.target.value))}
              placeholder="Leave blank for a pure challenge"
              className={`${INPUT} mt-1.5 pl-8 font-mono`}
            />
          </div>
          <p className="text-sm text-zinc-500">
            Ours to fund, so there is no floor and no split — whatever goes in
            here is what the winner is paid. {formatNaira(MAX_FUNDING_KOBO)} is
            the ceiling, because it is the largest single transfer Paystack will
            make.
          </p>
        </CardDialog>
      )}

      {card === "design" && (
        <CardDialog title="The safe" onClose={() => setCard(null)}>
          <p className="text-sm text-zinc-500">
            Decoration, and only decoration — it changes nothing about the game.
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
    </section>
  );
}

/** Digits only, never above the ceiling Paystack will actually transfer. */
function capNaira(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return "";
  return String(Math.min(Number(digits), MAX_FUNDING_KOBO / KOBO));
}

function AdminLogin({ onIn }: { onIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (res.ok) {
      onIn();
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(
      body.error === "not_configured"
        ? "Admin credentials aren't configured on this deployment."
        : "Those credentials didn't work."
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <form onSubmit={signIn} className="panel w-full max-w-sm space-y-3 rounded-3xl p-6">
        <h1 className="flex items-center gap-2 text-lg font-black tracking-tight">
          <Lock className="size-5 text-brass" aria-hidden />
          Admin
        </h1>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className={INPUT}
        />
        <div className="relative">
          <input
            type={reveal ? "text" : "password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className={`${INPUT} pr-12`}
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100 active:translate-y-[calc(-50%+1px)]"
          >
            {reveal ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
        {error && <p className="text-sm font-semibold text-berry">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className={`w-full ${PRIMARY}`}
        >
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel rounded-2xl p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-lg font-black">{value}</p>
      {hint && <p className="text-[11px] text-zinc-600">{hint}</p>}
    </div>
  );
}
