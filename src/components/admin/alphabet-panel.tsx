"use client";

// The alphabet, editable.
//
// This is the highest-leverage field on the admin screen and the one least
// obviously so, which is why the copy leans on it: every symbol added is
// another candidate at every position, so the list is the difference between a
// safe taking four hundred attempts and eighteen hundred. Adding six symbols
// is a bigger change to the game than any price on the page above it.
//
// Two things it is careful about. The editor works in **characters, not
// text** — you tap one to remove it, and type into a box to add — because a
// textarea of run-together symbols is unreadable and invites pasting a word by
// accident. And removing a symbol is explained rather than merely allowed:
// live safes keep their passwords, so a removed character stops appearing in
// *new* ones and remains typeable forever.

import { useCallback, useEffect, useState } from "react";
import { Keyboard, Plus, RotateCcw, X } from "lucide-react";
import { visible } from "@/lib/constants";

interface State {
  symbols: string[];
  defaults: string[];
  alphabetSize: number;
  guessSize: number;
}

export function AlphabetPanel() {
  const [state, setState] = useState<State | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/alphabet", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as State;
    setState(body);
    setDraft(body.symbols);
  }, []);

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
    setSaved(false);
    const res = await fetch("/api/admin/alphabet", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: draft }),
    });
    setBusy(false);
    if (!res.ok) return;
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
    await load();
  }

  /** Everything in the box that isn't already in the list, one per character. */
  function add() {
    const extra = [...adding].filter(
      (ch) => ch.trim().length > 0 && !/[a-z0-9]/i.test(ch) && !draft.includes(ch)
    );
    if (extra.length > 0) setDraft([...draft, ...extra]);
    setAdding("");
  }

  if (!state) {
    return (
      <section className="panel rounded-2xl p-5">
        <p className="py-4 text-center text-sm text-zinc-500">Loading the alphabet…</p>
      </section>
    );
  }

  const changed =
    draft.length !== state.symbols.length ||
    draft.some((ch, i) => ch !== state.symbols[i]);
  // 26 + 26 + 10, which are not editable and are always in.
  const total = 62 + draft.length;

  return (
    <section className="panel rounded-2xl p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-zinc-300">
        <Keyboard className="size-4" aria-hidden />
        The alphabet
      </h2>
      <p className="mb-4 text-xs leading-relaxed text-zinc-500">
        Every character a new password may contain, and the biggest single lever
        on the site: each one added is another candidate at every position, so
        this list is the difference between a safe taking hundreds of attempts
        and thousands. Letters and digits are always in and can’t be removed.
        Players can see the whole list from the guess screen.
      </p>

      <dl className="mb-4 grid grid-cols-2 gap-2">
        <Figure label="In a password" value={String(total)} />
        <Figure label="Symbols" value={String(draft.length)} />
      </dl>

      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
        Symbols — tap to remove
      </p>
      <div className="flex flex-wrap gap-1">
        {draft.map((ch) => (
          <button
            key={ch}
            type="button"
            onClick={() => setDraft(draft.filter((one) => one !== ch))}
            aria-label={`Remove ${ch === " " ? "the space" : ch}`}
            className="group flex size-9 items-center justify-center rounded-lg border-2 border-white/12 bg-white/6 font-mono text-sm font-black text-zinc-200 transition hover:border-berry hover:bg-berry/15 hover:text-berry"
          >
            <span className="group-hover:hidden">{visible(ch)}</span>
            <X className="hidden size-3.5 group-hover:block" aria-hidden />
          </button>
        ))}
        {draft.length === 0 && (
          <p className="text-xs text-zinc-500">
            Empty — the built-in list will be used instead.
          </p>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Paste or type symbols to add…"
          aria-label="Symbols to add"
          className="field px-3 py-2 font-mono text-sm"
        />
        <button
          type="button"
          onClick={add}
          disabled={adding.length === 0}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-white/15 bg-white/6 px-3 py-2 text-sm font-bold transition hover:border-brass/50 disabled:opacity-40"
        >
          <Plus className="size-4" aria-hidden />
          Add
        </button>
      </div>

      <p className="mt-3 rounded-xl bg-white/5 px-3 py-2.5 text-xs leading-relaxed text-zinc-500">
        <strong className="text-zinc-300">Removing one is safe.</strong> A live
        safe’s password can never be edited, so a character taken off this list
        stops appearing in new passwords and stays typeable in old ones forever.
        Adding one only affects passwords written afterwards — and note that the
        attempt estimates contributors are shown are still built on the default
        list of {state.defaults.length} symbols.
      </p>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !changed}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky rounded-xl bg-brass px-5 py-2.5 text-sm text-ink disabled:opacity-50"
        >
          {busy ? "Saving…" : saved ? "Saved" : "Save the alphabet"}
        </button>
        <button
          type="button"
          onClick={() => setDraft(state.defaults)}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold text-zinc-500 transition hover:text-zinc-200"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Built-in list
        </button>
      </div>
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/25 px-3 py-2">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-lg font-black">{value}</dd>
    </div>
  );
}
