"use client";

// Authoring a box's history.
//
// Everything on this screen is a number a visitor reads before they read
// anything else: how many people are on a safe, how many attempts it has taken,
// who cracked the last one. On day one all of those are zero, which is honest
// and also reads as "nobody has ever played this" — so the board gets a floor
// under it until real numbers overtake it.
//
// Two things this deliberately does not do, both of them in 0044 rather than
// here. It does not create accounts: a seeded winner and a seeded hunter are
// an address on a row, so they hold no lives, count towards no limit and never
// appear in the list of players. And a seeded crack writes no reward claim, so
// nothing here ever puts a debt on the payouts screen or emails anybody.
//
// Only our own boxes. A contributor's has real money behind it and a real
// player expecting to be able to win it.

import { useCallback, useEffect, useState } from "react";
import { Plus, Sprout, Trash2, Users } from "lucide-react";
import { Modal } from "@/components/ui/modal";

interface Hunter {
  email: string;
  percent: number;
}

interface SeedState {
  id: string;
  title: string;
  status: string;
  attemptsCount: number;
  playersCount: number;
  crackedBy: string | null;
  crackedAt: string | null;
  seededAt: string | null;
  seededBy: string | null;
  seedable: boolean;
}

const INPUT = "field px-3 py-2 text-sm";
/** Five is the ask, ten is what the chase can draw. */
const ROWS = 5;

export function SeedBoxDialog({
  boxId,
  onClose,
  onSeeded,
}: {
  boxId: string;
  onClose: () => void;
  onSeeded: () => void;
}) {
  const [box, setBox] = useState<SeedState | null>(null);
  const [attempts, setAttempts] = useState("");
  const [players, setPlayers] = useState("");
  const [winner, setWinner] = useState("");
  const [when, setWhen] = useState("");
  const [hunters, setHunters] = useState<Hunter[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/boxes/seed?boxId=${encodeURIComponent(boxId)}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const body = (await res.json()) as { box: SeedState; hunters: Hunter[] };
    setBox(body.box);
    setAttempts(body.box.attemptsCount > 0 ? String(body.box.attemptsCount) : "");
    setPlayers(body.box.playersCount > 0 ? String(body.box.playersCount) : "");
    setWinner(body.box.crackedBy ?? "");
    setWhen(body.box.crackedAt ? body.box.crackedAt.slice(0, 10) : "");
    setHunters(
      body.hunters.length > 0
        ? body.hunters
        : Array.from({ length: ROWS }, () => ({ email: "", percent: 0 }))
    );
  }, [boxId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function save() {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/admin/boxes/seed", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boxId,
        attemptsCount: Number(attempts || 0),
        playersCount: Number(players || 0),
        crackedBy: winner.trim() || undefined,
        // A date with no time lands at midnight UTC, which is what somebody
        // typing a date means.
        crackedAt: when ? new Date(`${when}T12:00:00Z`).toISOString() : undefined,
        hunters: hunters.filter((h) => h.email.trim().length > 0),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setNote("Couldn’t save that. Try again in a moment.");
      return;
    }
    const body = (await res.json()) as { changed: string[] };
    setNote(
      body.changed.length > 0 ? `Saved: ${body.changed.join(", ")}.` : "Nothing to change."
    );
    await load();
    onSeeded();
  }

  const set = (i: number, patch: Partial<Hunter>) =>
    setHunters((rows) => rows.map((row, at) => (at === i ? { ...row, ...patch } : row)));

  return (
    <Modal
      title="Seed this box"
      subtitle={box?.title}
      icon={<Sprout className="size-6 text-mint" aria-hidden />}
      width="md"
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy || !box?.seedable}
          onClick={() => void save()}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky w-full rounded-2xl bg-brass px-4 py-3.5 text-ink disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save the history"}
        </button>
      }
    >
      {!box ? (
        <p className="py-6 text-center text-sm text-zinc-500">Loading…</p>
      ) : !box.seedable ? (
        <p className="rounded-2xl border-2 border-berry/40 bg-berry/10 px-3 py-2.5 text-sm font-bold text-berry">
          This one belongs to a contributor. Their box has real money behind it
          and a real player expecting to be able to win it, so its history is
          not ours to write.
        </p>
      ) : (
        <div className="space-y-5 pb-1">
          {box.seededAt && (
            <p className="rounded-xl bg-white/5 px-3 py-2 text-xs text-zinc-400">
              Seeded {new Date(box.seededAt).toLocaleDateString()}
              {box.seededBy ? ` by ${box.seededBy}` : ""}. Every seeded box is
              marked, so the real numbers can always be told from these.
            </p>
          )}

          {/* ---- the counters ------------------------------------------ */}
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-zinc-400">
              <Users className="size-3.5" aria-hidden />
              What the board says
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field
                label="Hunters"
                value={players}
                onChange={setPlayers}
                hint="People shown as playing it"
              />
              <Field
                label="Attempts"
                value={attempts}
                onChange={setAttempts}
                hint="Guesses shown as made"
              />
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">
              These are a floor, not a fiction: real play carries on from
              whatever is set here, so the numbers only ever grow from this
              point.
            </p>
          </div>

          {/* ---- the leaderboard --------------------------------------- */}
          <div>
            <h3 className="mb-1 text-xs font-black uppercase tracking-wide text-zinc-400">
              The chase
            </h3>
            <p className="mb-2 text-xs text-zinc-500">
              Up to {ROWS} names on the leaderboard, closest first. Addresses
              are shown masked, exactly as a real hunter’s is — a player sees{" "}
              <span className="font-mono">a**@g***.com</span> and a percentage,
              and a real player overtakes a seeded one the moment they score
              higher.
            </p>
            <ul className="space-y-1.5">
              {hunters.slice(0, ROWS).map((row, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-4 shrink-0 text-center font-mono text-xs text-zinc-500">
                    {i + 1}
                  </span>
                  <input
                    value={row.email}
                    onChange={(e) => set(i, { email: e.target.value })}
                    placeholder="somebody@example.com"
                    className={`${INPUT} min-w-0 flex-1`}
                  />
                  <input
                    inputMode="decimal"
                    value={row.percent ? String(row.percent) : ""}
                    onChange={(e) =>
                      set(i, {
                        percent: Math.min(
                          100,
                          Math.max(0, Number(e.target.value.replace(/[^\d.]/g, "")) || 0)
                        ),
                      })
                    }
                    placeholder="%"
                    aria-label={`Percent for row ${i + 1}`}
                    className={`${INPUT} w-16 shrink-0 text-center font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => set(i, { email: "", percent: 0 })}
                    aria-label={`Clear row ${i + 1}`}
                    className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/10 hover:text-berry"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            {hunters.length < ROWS && (
              <button
                type="button"
                onClick={() => setHunters([...hunters, { email: "", percent: 0 }])}
                className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-zinc-400 transition hover:text-brass"
              >
                <Plus className="size-3.5" aria-hidden />
                Another row
              </button>
            )}
          </div>

          {/* ---- the crack --------------------------------------------- */}
          <div>
            <h3 className="mb-1 text-xs font-black uppercase tracking-wide text-zinc-400">
              Already cracked
            </h3>
            <p className="mb-2 text-xs text-zinc-500">
              Fill this in and the box closes as won by that address on that
              date, and joins the wall of cracked safes. It writes no reward
              claim and emails nobody — it is a picture of a finished game, not
              a finished game. There is no undo.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={winner}
                onChange={(e) => setWinner(e.target.value)}
                placeholder="winner@example.com"
                className={INPUT}
              />
              <input
                type="date"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                aria-label="Date cracked"
                className={INPUT}
              />
            </div>
          </div>

          {note && <p className="text-sm font-semibold text-mint">{note}</p>}
        </div>
      )}
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  hint: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-zinc-300">{label}</span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        placeholder="0"
        className={`${INPUT} mt-1 font-mono`}
      />
      <span className="mt-0.5 block text-[11px] text-zinc-500">{hint}</span>
    </label>
  );
}
