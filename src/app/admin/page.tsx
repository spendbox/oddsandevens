"use client";

// The platform's own back room.
//
// Three jobs: author the public box, send rewards to the people who cracked
// one, and hand out lives when something goes wrong on our side. Everything
// else runs itself — contributor payouts go through Paystack subaccounts and
// never need a human — so this stays small on purpose.

import { useCallback, useEffect, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import {
  ALPHABET,
  ALPHABET_SET,
  BLURB_MAX,
  MAX_LENGTH,
  MIN_LENGTH,
  TITLE_MAX,
} from "@/lib/constants";
import { formatNaira, rewardLabel } from "@/lib/game/rewards";
import { difficultyOf, estimateAttempts, roughly } from "@/lib/game/difficulty";
import { GrantLives } from "@/components/admin/grant-lives";
import type { PublicBox } from "@/lib/types";

const INPUT =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-brass";
const PRIMARY =
  "rounded-xl bg-brass px-5 py-3 font-semibold text-zinc-950 transition hover:bg-brass-bright disabled:opacity-50";

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
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
      <header className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-brass" aria-hidden />
        <h1 className="font-semibold">Spendbox admin</h1>
      </header>

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

      <section className="panel rounded-2xl p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
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

      <GeneralBoxForm onCreated={() => void load()} />

      <section className="panel rounded-2xl p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Every box
        </h2>
        <ul className="space-y-1.5">
          {boxes.map((box) => (
            <li
              key={box.id}
              className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">
                {box.title}
                <span className="ml-2 text-xs text-zinc-500">
                  {box.kind === "general" ? "public" : (box.contributor ?? "contributor")}
                </span>
              </span>
              <span className="shrink-0 font-mono text-xs text-brass">
                {rewardLabel(box.rewardKobo)}
              </span>
              <span className="shrink-0 text-xs text-zinc-500">{box.status}</span>
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
                  className="shrink-0 text-xs text-red-400 hover:underline"
                >
                  Close
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
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
        The public box
      </h2>
      <p className="mt-1 text-xs text-zinc-500">
        Free to play and funded by us, so there&apos;s nothing to collect and no
        split — just a reward, or none at all, which makes it a pure challenge.
        Publishing a new one closes the current one; only one is ever live.
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
          {clean.length} characters
          {valid &&
            ` — ${difficultyOf(clean.length)}, about ${roughly(estimateAttempts(clean.length))} attempts to crack`}
        </p>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="button"
          disabled={busy || !valid || !title.trim()}
          onClick={() => void create()}
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
      <form onSubmit={signIn} className="panel w-full max-w-sm space-y-3 rounded-2xl p-6">
        <h1 className="flex items-center gap-2 font-semibold">
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
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className={INPUT}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className={`w-full ${PRIMARY}`}>
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel rounded-xl p-3">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-lg font-bold text-zinc-100">{value}</p>
      {hint && <p className="text-[11px] text-zinc-600">{hint}</p>}
    </div>
  );
}
