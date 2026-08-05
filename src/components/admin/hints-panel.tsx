"use client";

// The hints, editable.
//
// One of these is drawn at random every time somebody opens the guess dialog,
// which on a hard box is forty times an hour — so this list is read more often
// than any other copy on the site, and it is the copy most worth tuning after
// watching people play.
//
// A textarea rather than a table of inputs, and that is deliberate. These are
// sentences; they are written, reordered and rewritten in bulk, and a row of
// forty single-line fields with add and delete buttons is a worse editor for
// prose than the thing every writer already uses. One hint per line, blank
// lines ignored.

import { useCallback, useEffect, useState } from "react";
import { Lightbulb, RotateCcw } from "lucide-react";

export function HintsPanel() {
  const [text, setText] = useState("");
  const [stored, setStored] = useState("");
  const [defaults, setDefaults] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/hints", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { hints: string[]; defaults: string[] };
    const joined = body.hints.join("\n");
    setText(joined);
    setStored(joined);
    setDefaults(body.defaults);
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
    const res = await fetch("/api/admin/hints", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hints: text.split("\n") }),
    });
    setBusy(false);
    if (!res.ok) return;
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
    await load();
  }

  const lines = text.split("\n").filter((line) => line.trim().length >= 8);
  const changed = text !== stored;

  return (
    <section className="panel rounded-2xl p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-zinc-300">
        <Lightbulb className="size-4" aria-hidden />
        Hints
      </h2>
      <p className="mb-3 text-xs leading-relaxed text-zinc-500">
        One of these is shown at random every time somebody opens the guess
        box. One per line. Keep them{" "}
        <strong className="text-zinc-300">general</strong> — a hint is about the
        shape of the problem, never about a particular safe, which is what makes
        it safe to show the same list to everybody. And keep them{" "}
        <strong className="text-zinc-300">actionable</strong>: “a password may
        contain spaces” is a fact for the FAQ, “if you are stuck, try replacing
        a character with a space” is something a player can do in the next ten
        seconds. Empty the box entirely to go back to the built-in{" "}
        {defaults.length}.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        spellCheck
        placeholder="One hint per line…"
        className="field px-3 py-2.5 text-sm leading-relaxed"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !changed}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky rounded-xl bg-brass px-5 py-2.5 text-sm text-ink disabled:opacity-50"
        >
          {busy ? "Saving…" : saved ? "Saved" : "Save the hints"}
        </button>
        <button
          type="button"
          onClick={() => setText(defaults.join("\n"))}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold text-zinc-500 transition hover:text-zinc-200"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Built-in list
        </button>
        <span className="text-xs text-zinc-500">
          {lines.length} {lines.length === 1 ? "hint" : "hints"} in play
        </span>
      </div>
    </section>
  );
}
