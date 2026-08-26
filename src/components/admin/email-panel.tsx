"use client";

// Writing to players, by hand.
//
// The one channel here that can hurt something else if it is used badly: the
// domain that carries a campaign is the domain that carries the six-digit
// codes people sign in with. So the batch is capped, a test send to one real
// address is a first-class button rather than a workaround, and the
// unsubscribed count is on the screen beside the reach — a number going up
// there is the earliest warning you get.

import { useEffect, useState } from "react";
import { Loader2, Mail, Send } from "lucide-react";
import { plural } from "@/lib/plural";

interface Audience {
  total: number;
  idle: number;
  gone: number;
  neverPlayed: number;
  spenders: number;
  unsubscribed: number;
}

type Segment = "idle" | "gone" | "never_played" | "spenders" | "all";

const SEGMENTS: { id: Segment; label: string; note: string; of: keyof Audience }[] = [
  { id: "idle", label: "Away 3–30 days", note: "played, then stopped", of: "idle" },
  { id: "gone", label: "Away 30+ days", note: "properly lapsed", of: "gone" },
  { id: "never_played", label: "Never played", note: "verified, never guessed", of: "neverPlayed" },
  { id: "spenders", label: "Has spent", note: "your most valuable list", of: "spenders" },
  { id: "all", label: "Everyone", note: "almost never the right answer", of: "total" },
];

const CHIP = "rounded-lg px-3 py-1.5 text-xs font-bold transition active:translate-y-px";

export function EmailPanel() {
  const [audience, setAudience] = useState<Audience | null>(null);
  const [configured, setConfigured] = useState(true);
  const [batchMax, setBatchMax] = useState(200);
  const [unmigrated, setUnmigrated] = useState(false);
  const [segment, setSegment] = useState<Segment>("idle");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [testTo, setTestTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await fetch("/api/admin/email", { cache: "no-store" });
      if (!live) return;
      setUnmigrated(res.status === 503);
      if (res.ok) {
        const body = (await res.json()) as {
          configured: boolean;
          batchMax: number;
          audience: Audience;
        };
        if (!live) return;
        setConfigured(body.configured);
        setBatchMax(body.batchMax);
        setAudience(body.audience);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const reach = audience ? audience[SEGMENTS.find((s) => s.id === segment)!.of] : 0;
  const ready = subject.trim().length > 0 && message.trim().length > 0;

  const send = async (mode: "count" | "test" | "real") => {
    setBusy(true);
    setSaid(null);
    try {
      const res = await fetch("/api/admin/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          segment,
          subject,
          message,
          test: mode !== "real",
          onlyTo: mode === "test" ? testTo.trim() : undefined,
        }),
      });
      const body = (await res.json()) as {
        result?: string;
        matched?: number;
        sent?: number;
        truncated?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setSaid(
          body.error === "not_a_player"
            ? "No player has that address."
            : (body.error ?? "That didn’t send.")
        );
      } else if (body.result === "dry_run") {
        setSaid(`Would reach ${plural(body.matched ?? 0, "inbox", "inboxes")}. Nothing sent.`);
      } else if (mode === "test") {
        setSaid(`Sent one to ${testTo.trim()}. Check the unsubscribe link works.`);
      } else {
        setSaid(
          `Sent ${plural(body.sent ?? 0, "email")}.` +
            (body.truncated
              ? ` ${(body.matched ?? 0) - (body.sent ?? 0)} left over — send again to continue.`
              : "")
        );
        setConfirming(false);
      }
    } finally {
      setBusy(false);
    }
  };

  if (unmigrated) {
    return (
      <div className="panel rounded-2xl px-4 py-8 text-center">
        <p className="font-black tracking-tight">Email needs a migration.</p>
        <p className="mt-1 text-sm text-zinc-400">
          Run <code className="font-mono">npx supabase db push</code>.
        </p>
      </div>
    );
  }

  return (
    <section className="panel rounded-2xl p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-zinc-300">
        <Mail className="size-4 text-sky" aria-hidden />
        Email players
      </h2>
      <p className="mb-3 text-xs leading-relaxed text-zinc-500">
        Every message carries a one-click unsubscribe, and anybody who has used
        it is already excluded from the counts below.{" "}
        <strong className="text-zinc-400">
          This is the same domain your sign-in codes go out from
        </strong>{" "}
        — warm it up on a small segment before a big one.
        {audience && audience.unsubscribed > 0 && (
          <span className="text-zinc-400">
            {" "}
            {plural(audience.unsubscribed, "person has", "people have")} unsubscribed so far.
          </span>
        )}
      </p>

      {!configured && (
        <p className="mb-3 rounded-xl bg-berry/12 px-3 py-2.5 text-sm text-berry">
          No <code className="font-mono">RESEND_API_KEY</code>. Messages are logged
          to the server console instead of sent.
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {SEGMENTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setSegment(s.id);
              setConfirming(false);
            }}
            className={`${CHIP} ${
              segment === s.id ? "bg-brass text-ink" : "bg-white/6 text-zinc-400 hover:bg-white/10"
            }`}
          >
            {s.label}
            <span className="ml-1.5 font-mono opacity-70">
              {audience ? audience[s.of] : "—"}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-3 text-sm">
        <strong className="font-mono text-lg font-black text-brass">{reach}</strong>{" "}
        <span className="text-zinc-400">
          {reach === 1 ? "inbox" : "inboxes"} — {SEGMENTS.find((s) => s.id === segment)!.note}
        </span>
        {reach > batchMax && (
          <span className="text-zinc-500">
            {" "}
            · {batchMax} per press, so this takes {Math.ceil(reach / batchMax)} sends
          </span>
        )}
      </p>

      <div className="mt-3 space-y-2">
        <Field label="Subject" value={subject} onChange={setSubject} max={120} placeholder="Your safe is still open" />
        <Field
          label="Message"
          value={message}
          onChange={setMessage}
          max={4000}
          rows={6}
          placeholder={"Nobody has cracked it yet.\n\nYour lives are full — that's seven guesses waiting."}
        />
      </div>
      <p className="mt-1 text-[11px] text-zinc-600">
        Plain text. A blank line starts a new paragraph; nothing else is
        interpreted, and anything that looks like markup is escaped.
      </p>

      {said && <p className="mt-3 text-sm text-mint">{said}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={testTo}
          onChange={(e) => setTestTo(e.target.value)}
          placeholder="you@example.com"
          className="field w-56 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void send("test")}
          disabled={busy || !ready || !testTo.trim()}
          className="rounded-xl bg-white/8 px-4 py-2.5 text-sm font-bold text-zinc-200 transition hover:bg-white/12 disabled:opacity-50"
        >
          Send me one
        </button>
        <button
          type="button"
          onClick={() => void send("count")}
          disabled={busy || !ready}
          className="rounded-xl bg-white/8 px-4 py-2.5 text-sm font-bold text-zinc-300 transition hover:bg-white/12 disabled:opacity-50"
        >
          Count only
        </button>
        <span className="grow" />
        {/* Two presses, because there is no unsend. */}
        <button
          type="button"
          onClick={() => (confirming ? void send("real") : setConfirming(true))}
          disabled={busy || !ready || reach === 0}
          style={{ "--btn-lip": "var(--sky-deep)" } as React.CSSProperties}
          className="btn-chunky flex items-center gap-2 rounded-xl bg-sky px-4 py-2.5 text-sm text-ink disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
          {confirming ? `Yes — email ${Math.min(reach, batchMax)}` : "Send"}
        </button>
        {confirming && (
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-sm font-bold text-zinc-500 hover:text-zinc-300"
          >
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  max,
  placeholder,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder: string;
  rows?: number;
}) {
  const Tag = rows ? "textarea" : "input";
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between text-[11px] font-bold uppercase tracking-wide text-zinc-500">
        {label}
        <span className={value.length > max * 0.9 ? "text-berry" : "text-zinc-600"}>
          {value.length}/{max}
        </span>
      </span>
      <Tag
        value={value}
        maxLength={max}
        rows={rows}
        placeholder={placeholder}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          onChange(e.target.value)
        }
        className="field w-full px-4 py-2.5"
      />
    </label>
  );
}
