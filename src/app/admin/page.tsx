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
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  Star,
  Trash2,
  Users,
  Vault,
  Wallet,
} from "lucide-react";
import {
  ALPHABET,
  ALPHABET_SET,
  BLURB_MAX,
  MAX_LENGTH,
  MIN_LENGTH,
  TITLE_MAX,
} from "@/lib/constants";
import { formatNaira, rewardLabel } from "@/lib/game/rewards";
import { difficultyOf } from "@/lib/game/difficulty";
import { GrantLives } from "@/components/admin/grant-lives";
import { UsersPanel } from "@/components/admin/users-panel";
import { DeleteBoxDialog } from "@/components/admin/delete-box-dialog";
import type { PublicBox } from "@/lib/types";

const INPUT =
  "w-full rounded-xl border-2 border-white/10 bg-black/25 px-4 py-3 text-foreground outline-none transition placeholder:text-zinc-500 focus:border-brass";
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

          <GrantLives />
        </>
      )}

      {tab === "players" && <UsersPanel />}

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
          className="mt-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold transition hover:border-brass/40 disabled:opacity-50"
        >
          {busy ? "Marking…" : "Mark as sent"}
        </button>
      )}
      {claim.status === "paid" && (
        <p className="mt-1 text-xs text-mark-green">Sent</p>
      )}
    </li>
  );
}

function GeneralBoxForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [blurb, setBlurb] = useState("");
  const [secret, setSecret] = useState("");
  const [rewardNaira, setRewardNaira] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clean = secret
    .toUpperCase()
    .split("")
    .filter((ch) => ALPHABET_SET.has(ch))
    .join("");
  const valid = clean.length >= MIN_LENGTH && clean.length <= MAX_LENGTH;

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
        rewardKobo: Math.round(Number(rewardNaira || 0) * 100),
      }),
    });
    setBusy(false);
    if (res.ok) {
      setTitle("");
      setBlurb("");
      setSecret("");
      setRewardNaira("");
      onCreated();
      return;
    }
    setError("Couldn't create that box. Check the fields.");
  }

  return (
    <section className="panel rounded-2xl p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
        The Spendbox box
      </h2>
      <p className="mt-1 text-xs text-zinc-500">
        Funded by us, so there&apos;s nothing to collect and no split — just a
        reward, or none at all, which makes it a pure challenge. You can have as
        many live at once as you like; feature the ones worth the front page.
      </p>

      <div className="mt-3 space-y-2">
        <input
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className={INPUT}
        />
        <input
          value={blurb}
          maxLength={BLURB_MAX}
          onChange={(e) => setBlurb(e.target.value)}
          placeholder="One line for the card. Optional."
          className={INPUT}
        />
        <div className="flex gap-2">
          <input
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Password"
            spellCheck={false}
            autoComplete="off"
            className={`${INPUT} font-mono tracking-[0.2em]`}
          />
          <button
            type="button"
            onClick={() => {
              const bytes = new Uint32Array(6);
              crypto.getRandomValues(bytes);
              setSecret(Array.from(bytes, (n) => ALPHABET[n % ALPHABET.length]).join(""));
            }}
            className="shrink-0 rounded-xl border border-white/10 px-3 text-sm text-zinc-400 hover:border-brass/40"
          >
            Roll
          </button>
        </div>
        <div className="relative">
          <span className="absolute inset-y-0 left-4 flex items-center text-zinc-500">₦</span>
          <input
            inputMode="numeric"
            value={rewardNaira}
            onChange={(e) => setRewardNaira(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="Reward — leave blank for a pure challenge"
            className={`${INPUT} pl-8 font-mono`}
          />
        </div>

        <p className="text-xs text-zinc-500">
          {clean.length} characters{valid && ` — ${difficultyOf(clean.length)}`}
        </p>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="button"
          disabled={busy || !valid || !title.trim()}
          onClick={() => void create()}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className={PRIMARY}
        >
          {busy ? "Publishing…" : "Publish it"}
        </button>
      </div>
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
