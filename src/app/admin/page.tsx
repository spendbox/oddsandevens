"use client";

// The platform's own back room.
//
// It grew past one screen, so it is four: money, the people, the boxes, and
// our own box. Money moves by hand now — both halves of it, a winner's reward
// and a contributor's share — so this screen is where that happens, and both
// ledgers are built so that recording a transfer late or twice is harmless.
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
  Handshake,
  Lock,
  Palette,
  ShieldCheck,
  Tag,
  Sprout,
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
import { capNaira, formatNaira, rewardLabel } from "@/lib/game/rewards";
import { difficultyOf } from "@/lib/game/difficulty";
import { DESIGNS, DESIGN_SPECS, DEFAULT_DESIGN, type Design } from "@/lib/game/designs";
import { SafeArt } from "@/components/safe/safe-art";
import { CharsetDialog, useAlphabet } from "@/components/charset-dialog";
import { BuildCard, CardDialog } from "@/components/dashboard/build-panel";
import { PayoutsPanel } from "@/components/admin/payouts-panel";
import { PricingPanel } from "@/components/admin/pricing-panel";
import { AlphabetPanel } from "@/components/admin/alphabet-panel";
import { HintsPanel } from "@/components/admin/hints-panel";
import { LimitsPanel } from "@/components/admin/limits-panel";
import { GrantLives } from "@/components/admin/grant-lives";
import { UsersPanel } from "@/components/admin/users-panel";
import { ActivityPanel } from "@/components/admin/activity-panel";
import { PushPanel } from "@/components/admin/push-panel";
import { FreeSafesPanel } from "@/components/admin/free-safes-panel";
import { DeleteBoxDialog } from "@/components/admin/delete-box-dialog";
import { SeedBoxDialog } from "@/components/admin/seed-box-dialog";
import { PrizeDialog } from "@/components/admin/prize-dialog";
import { SponsorDialog } from "@/components/admin/sponsor-dialog";
import {
  EMPTY_SPONSOR,
  SponsorFields,
  sponsorPayload,
  sponsorSummary,
  type SponsorDraft,
} from "@/components/admin/sponsor-fields";
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
  /** There is an account to send it to. Without one there is nothing to tick. */
  payable: boolean;
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
  const [seeding, setSeeding] = useState<string | null>(null);
  const [pricing, setPricing] = useState<AdminBox | null>(null);
  const [sponsoring, setSponsoring] = useState<AdminBox | null>(null);

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

  // Anything not yet sent that *can* be sent. A claim with no account behind
  // it is waiting on the player, not on us, so it does not count as a job.
  const owed = claims.filter((c) => c.status !== "paid" && c.payable);

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

          <HintsPanel />

          <GrantLives />
        </>
      )}

      {tab === "players" && (
        <>
          {/* Who is here, before who has spent: the list below answers a
              support email, this answers whether there is anybody to email. */}
          <ActivityPanel />
          <FreeSafesPanel />
          <PushPanel />
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
            <strong className="text-zinc-300">Delete</strong> is permanent and takes
            every attempt with it.{" "}
            <strong className="text-zinc-300">Feature</strong> puts a live box at
            the top of the landing page — as many as you like, from either side,
            and cracking one clears it automatically.{" "}
            <strong className="text-zinc-300">Seed</strong> writes the history of
            one of our own boxes: its hunter and attempt counts, the names on its
            chase, and whether it has already been cracked. And{" "}
            <strong className="text-zinc-300">the figure itself is a button</strong>{" "}
            on our own boxes — a prize can be added or raised long after the box
            went up, though never lowered.{" "}
            <strong className="text-zinc-300">Sponsor</strong> puts a business
            behind one of ours: their name and logo on every surface the box
            appears on, and a reward the winner gets from them on top of our
            money. Emptying the name is how a deal that has ended comes off.
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
                {/* The figure is the button on our own boxes: an admin who
                    wants to change what a box is worth goes to what it is
                    worth. A contributor's stays as it is — theirs moves with
                    their funding and nothing else. */}
                {box.kind === "general" &&
                ["draft", "funding", "live"].includes(box.status) ? (
                  <button
                    type="button"
                    onClick={() => setPricing(box)}
                    aria-label={`Set the prize on ${box.title}`}
                    className="shrink-0 rounded-lg px-1.5 py-1 font-mono text-xs text-brass underline decoration-brass/40 underline-offset-4 transition hover:bg-brass/10 active:translate-y-px"
                  >
                    {rewardLabel(box.rewardKobo)}
                  </button>
                ) : (
                  <span className="shrink-0 font-mono text-xs text-brass">
                    {rewardLabel(box.rewardKobo)}
                  </span>
                )}
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
                {/* Ours only, exactly as the prize and the history are: a
                    sponsorship is a deal we sign, and a contributor's safe is
                    not ours to sell space on. Available on a finished box too
                    — an unlocked one still names who was behind it on its
                    result screen, and its winner still has a reward coming. */}
                {box.kind === "general" && (
                  <button
                    type="button"
                    onClick={() => setSponsoring(box)}
                    className={
                      "flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold transition active:translate-y-px " +
                      (box.sponsor
                        ? "bg-grape text-white"
                        : "bg-grape/15 text-grape hover:bg-grape/25")
                    }
                  >
                    <Handshake className="size-3.5" aria-hidden />
                    {box.sponsor?.name ?? "Sponsor"}
                  </button>
                )}
                {/* Ours only: a contributor's history is not ours to write. */}
                {box.kind === "general" && (
                  <button
                    type="button"
                    onClick={() => setSeeding(box.id)}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-mint/15 px-2 py-1 text-xs font-bold text-mint transition hover:bg-mint/25 active:translate-y-px"
                  >
                    <Sprout className="size-3.5" aria-hidden />
                    Seed
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

      {seeding && (
        <SeedBoxDialog
          boxId={seeding}
          onClose={() => setSeeding(null)}
          onSeeded={() => void load()}
        />
      )}

      {pricing && (
        <PrizeDialog
          boxId={pricing.id}
          boxTitle={pricing.title}
          rewardKobo={pricing.rewardKobo}
          onClose={() => setPricing(null)}
          onSaved={() => void load()}
        />
      )}

      {sponsoring && (
        <SponsorDialog
          boxId={sponsoring.id}
          boxTitle={sponsoring.title}
          sponsor={sponsoring.sponsor}
          onClose={() => setSponsoring(null)}
          onSaved={() => void load()}
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
          {/* The account comes off the player, not the claim — which is why
              this used to be blank for everybody after bank details moved to
              the account tab. */}
          <p className="mt-0.5 text-xs text-zinc-500">
            {claim.payable ? (
              <span className="text-zinc-300">
                {claim.accountName} · {claim.bankName} ·{" "}
                <span className="font-mono">{claim.accountNumber}</span>
              </span>
            ) : (
              "No bank account on their profile yet"
            )}
          </p>
        </div>
        <span className="shrink-0 font-mono text-brass">{formatNaira(claim.amountKobo)}</span>
      </div>

      {claim.status !== "paid" && (
        <button
          type="button"
          disabled={busy || !claim.payable}
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
          className="mt-2 flex items-center gap-1.5 rounded-lg border border-mark-green/40 bg-mark-green/10 px-3 py-1.5 text-xs font-semibold text-mark-green transition hover:border-mark-green disabled:opacity-40"
        >
          <Check className="size-3.5" aria-hidden />
          {busy
            ? "Marking…"
            : claim.payable
              ? "Tick when sent"
              : "Waiting on their account"}
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
  const [card, setCard] = useState<
    "box" | "password" | "reward" | "design" | "history" | "sponsor" | null
  >(null);
  const [chars, setChars] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Seeding, folded into the same four-card form.
   *
   * A box authored as already-cracked is one request rather than two, and the
   * second request is the one that gets forgotten. Everything here is optional
   * and everything here is marked in the database — see 0044.
   */
  const [attempts, setAttempts] = useState("");
  const [hunters, setHunters] = useState("");
  const [winner, setWinner] = useState("");
  const [when, setWhen] = useState("");
  const [board, setBoard] = useState<{ email: string; percent: string }[]>(
    Array.from({ length: 5 }, () => ({ email: "", percent: "" }))
  );

  /*
   * The sponsor, filled in with the box rather than bolted on after it.
   *
   * Same argument as seeding: the second request is the one that gets
   * forgotten, and a sponsored box that goes live for an hour with no business
   * on it is an hour somebody paid for and didn't get. The Boxes list can still
   * add or end one afterwards — deals are signed on their own schedule — and
   * both routes go through the same function.
   */
  const [sponsor, setSponsor] = useState<SponsorDraft>(EMPTY_SPONSOR);

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
        attemptsCount: Number(attempts || 0),
        playersCount: Number(hunters || 0),
        crackedBy: winner.trim() || undefined,
        crackedAt: when ? new Date(`${when}T12:00:00Z`).toISOString() : undefined,
        hunters: board
          .filter((row) => row.email.trim().length > 0)
          .map((row) => ({ email: row.email.trim(), percent: Number(row.percent || 0) })),
        sponsor: sponsorPayload(sponsor),
      }),
    });
    setBusy(false);
    if (res.ok) {
      setTitle("");
      setBlurb("");
      setSecret("");
      setRewardNaira("");
      setDesign(DEFAULT_DESIGN);
      setAttempts("");
      setHunters("");
      setWinner("");
      setWhen("");
      setBoard(Array.from({ length: 5 }, () => ({ email: "", percent: "" })));
      setSponsor(EMPTY_SPONSOR);
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
        The last two cards are ours alone: a business behind the safe, and a
        history for it to arrive with.
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
        {/* The fifth card: a business behind it, and what they are adding to
            what we pay. Optional, like the sixth. */}
        <BuildCard
          icon={<Handshake className="size-4" aria-hidden />}
          label="The sponsor"
          value={sponsorSummary(sponsor)}
          done={sponsor.name.trim().length > 0}
          onOpen={() => setCard("sponsor")}
        />
        {/* The sixth card, and the other optional one. */}
        <BuildCard
          icon={<Sprout className="size-4" aria-hidden />}
          label="Its history"
          value={
            winner.trim()
              ? `Cracked by ${winner.trim()}`
              : hunters || attempts
                ? `${hunters || 0} hunters · ${attempts || 0} attempts`
                : "Starts from nothing"
          }
          done={!!(winner.trim() || hunters || attempts)}
          onOpen={() => setCard("history")}
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
        {busy
          ? "Creating…"
          : !ready
            ? "Fill in the cards above"
            : winner.trim()
              ? "Create it, already cracked"
              : "Put it live"}
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
        <CardDialog
          title="The password"
          onClose={() => setCard(null)}
          blocked={
            length < MIN_LENGTH
              ? `At least ${MIN_LENGTH} characters`
              : rejected.length > 0
                ? "Remove what isn't allowed"
                : null
          }
        >
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
            {/* `pointer-events-none`: the mark is drawn over the field, so
                without it the tap that lands on it focuses nothing. */}
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-zinc-400">
              ₦
            </span>
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

      {card === "sponsor" && (
        <CardDialog title="The sponsor" onClose={() => setCard(null)}>
          <p className="text-sm text-zinc-400">
            A business behind this safe. Their name and logo go on every surface
            the box appears on, and whatever they are giving the winner sits
            alongside our money rather than replacing it — the reward above is
            still paid in full, within 24 hours, exactly as on any other box.
          </p>
          <SponsorFields draft={sponsor} onChange={setSponsor} />
        </CardDialog>
      )}

      {card === "history" && (
        <CardDialog title="Its history" onClose={() => setCard(null)}>
          <p className="text-sm text-zinc-400">
            All of this is optional, and all of it is marked in the database as
            authored rather than played — the real numbers can always be told
            from these, and one query removes them. No accounts are created: a
            seeded winner and a seeded hunter are an address on a row, so they
            hold no lives and never appear in the list of players. Addresses are
            shown masked, exactly as a real hunter&apos;s is.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold text-zinc-300">Hunters</span>
              <input
                inputMode="numeric"
                value={hunters}
                onChange={(e) => setHunters(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="0"
                className={`${INPUT} mt-1.5 font-mono`}
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-zinc-300">Attempts</span>
              <input
                inputMode="numeric"
                value={attempts}
                onChange={(e) => setAttempts(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="0"
                className={`${INPUT} mt-1.5 font-mono`}
              />
            </label>
          </div>
          <p className="text-xs text-zinc-500">
            A floor rather than a fiction: real play carries on from whatever is
            set here, so the numbers only ever grow from this point.
          </p>

          <div>
            <p className="text-sm font-bold text-zinc-300">The chase</p>
            <p className="mb-2 mt-0.5 text-xs text-zinc-500">
              Up to five names on the leaderboard, closest first. A real player
              overtakes a seeded one the moment they score higher.
            </p>
            <ul className="space-y-1.5">
              {board.map((row, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-4 shrink-0 text-center font-mono text-xs text-zinc-500">
                    {i + 1}
                  </span>
                  <input
                    value={row.email}
                    onChange={(e) =>
                      setBoard((rows) =>
                        rows.map((r, at) => (at === i ? { ...r, email: e.target.value } : r))
                      )
                    }
                    placeholder="somebody@example.com"
                    className={`${INPUT} min-w-0 flex-1 py-2 text-sm`}
                  />
                  <input
                    inputMode="decimal"
                    value={row.percent}
                    onChange={(e) =>
                      setBoard((rows) =>
                        rows.map((r, at) =>
                          at === i ? { ...r, percent: e.target.value.replace(/[^\d.]/g, "") } : r
                        )
                      )
                    }
                    placeholder="%"
                    aria-label={`Percent for row ${i + 1}`}
                    className={`${INPUT} w-16 shrink-0 py-2 text-center font-mono text-sm`}
                  />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-bold text-zinc-300">Already cracked</p>
            <p className="mb-2 mt-0.5 text-xs text-zinc-500">
              Fill this in and the box is created finished: closed, won by that
              address on that date, and on the wall of cracked safes. It writes
              no reward claim and emails nobody. There is no undo.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={winner}
                onChange={(e) => setWinner(e.target.value)}
                placeholder="winner@example.com"
                className={`${INPUT} py-2 text-sm`}
              />
              <input
                type="date"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                aria-label="Date cracked"
                className={`${INPUT} py-2 text-sm`}
              />
            </div>
          </div>
        </CardDialog>
      )}
    </section>
  );
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
