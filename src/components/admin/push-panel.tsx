"use client";

// Waking people up, with the count in front of you while you write.
//
// The number of people a message will reach is the single fact most likely to
// change what the message says, and on most tools it lives on a different
// screen from the box you type into. Here it sits above the words and moves
// when the segment changes, because "1,400 phones" and "12 phones" are not the
// same sentence.

import { useEffect, useState } from "react";
import { Bell, Loader2, Send } from "lucide-react";
import { plural } from "@/lib/plural";

interface Audience {
  total: number;
  players: number;
  idle: number;
  gone: number;
  neverPlayed: number;
  failing: number;
}

type Segment = "idle" | "gone" | "never_played" | "all";

const SEGMENTS: { id: Segment; label: string; note: string; of: keyof Audience }[] = [
  { id: "idle", label: "Away 3–30 days", note: "played, then stopped", of: "idle" },
  { id: "gone", label: "Away 30+ days", note: "properly lapsed", of: "gone" },
  { id: "never_played", label: "Never played", note: "signed up, never guessed", of: "neverPlayed" },
  { id: "all", label: "Everyone", note: "use this almost never", of: "total" },
];

const TITLE_MAX = 60;
const BODY_MAX = 140;

const CHIP = "rounded-lg px-3 py-1.5 text-xs font-bold transition active:translate-y-px";

export function PushPanel() {
  const [audience, setAudience] = useState<Audience | null>(null);
  const [configured, setConfigured] = useState(true);
  const [unmigrated, setUnmigrated] = useState(false);
  const [segment, setSegment] = useState<Segment>("idle");
  const [title, setTitle] = useState("Your safe is still open");
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("/");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await fetch("/api/admin/push", { cache: "no-store" });
      if (!live) return;
      setUnmigrated(res.status === 503);
      if (res.ok) {
        const body = (await res.json()) as { configured: boolean; audience: Audience };
        if (!live) return;
        setConfigured(body.configured);
        setAudience(body.audience);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const reach = audience ? audience[SEGMENTS.find((s) => s.id === segment)!.of] : 0;
  const ready = title.trim().length > 0 && message.trim().length > 0 && reach > 0;

  const send = async (test: boolean) => {
    setBusy(true);
    setSaid(null);
    try {
      const res = await fetch("/api/admin/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ segment, title, message, url, test }),
      });
      const body = (await res.json()) as {
        result?: string;
        matched?: number;
        sent?: number;
        gone?: number;
        failed?: number;
        error?: string;
      };
      if (!res.ok) {
        setSaid(body.error ?? "That didn’t send.");
      } else if (body.result === "dry_run") {
        setSaid(`Would reach ${plural(body.matched ?? 0, "phone")}. Nothing sent.`);
      } else {
        // The pruned count is worth printing rather than hiding: it is how a
        // list stays honest, and a big number means it needed doing.
        setSaid(
          `Sent to ${plural(body.sent ?? 0, "phone")}.` +
            ((body.gone ?? 0) > 0 ? ` ${plural(body.gone!, "dead subscription")} removed.` : "") +
            ((body.failed ?? 0) > 0 ? ` ${body.failed} failed.` : "")
        );
        setConfirming(false);
        setMessage("");
      }
    } finally {
      setBusy(false);
    }
  };

  if (unmigrated) {
    return (
      <div className="panel rounded-2xl px-4 py-8 text-center">
        <p className="font-black tracking-tight">Push needs a migration.</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-400">
          The database is missing <code className="font-mono">push_subscriptions</code>.
          Run <code className="font-mono">npx supabase db push</code>.
        </p>
      </div>
    );
  }

  return (
    <section className="panel rounded-2xl p-5">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-zinc-300">
        <Bell className="size-4 text-grape" aria-hidden />
        Notify players
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        Free to send, and the only channel that can’t hurt the address your
        verification codes go out from.{" "}
        {audience && audience.failing > 0 && (
          <span className="text-zinc-400">
            {plural(audience.failing, "subscription")} currently failing; they
            drop off on their own.
          </span>
        )}
      </p>

      {!configured && (
        <p className="mb-3 rounded-xl bg-berry/12 px-3 py-2.5 text-sm text-berry">
          No VAPID keys on this deployment. Run{" "}
          <code className="font-mono">npm run vapid</code> and set them, or
          nothing here will send.
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
              segment === s.id
                ? "bg-brass text-ink"
                : "bg-white/6 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
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
          {reach === 1 ? "phone will buzz" : "phones will buzz"} —{" "}
          {SEGMENTS.find((s) => s.id === segment)!.note}
        </span>
      </p>

      <div className="mt-3 space-y-2">
        <Field
          label="Title"
          value={title}
          onChange={setTitle}
          max={TITLE_MAX}
          placeholder="Your safe is still open"
        />
        <Field
          label="Message"
          value={message}
          onChange={setMessage}
          max={BODY_MAX}
          placeholder="Your best is 68%. Nobody has beaten it yet."
          area
        />
        <Field label="Opens" value={url} onChange={setUrl} max={200} placeholder="/" />
      </div>

      {/* What it will look like, rather than a description of what it will look
          like. Two lines of copy is a thing you judge by eye. */}
      <div className="mt-3 rounded-2xl bg-black/30 p-3">
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-600">
          On a phone
        </p>
        <div className="flex items-start gap-2.5 rounded-xl bg-white/8 p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-192.png" alt="" className="size-8 shrink-0 rounded-lg" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">
              {title.trim() || "Spendbox"}
            </span>
            <span className="line-clamp-2 block text-xs text-zinc-400">
              {message.trim() || "…"}
            </span>
          </span>
        </div>
      </div>

      {said && <p className="mt-3 text-sm text-mint">{said}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void send(true)}
          disabled={busy || !ready}
          className="rounded-xl bg-white/8 px-4 py-2.5 text-sm font-bold text-zinc-300 transition hover:bg-white/12 active:translate-y-px disabled:opacity-50"
        >
          Count only
        </button>
        {/* Two presses, because there is no unsend. */}
        <button
          type="button"
          onClick={() => (confirming ? void send(false) : setConfirming(true))}
          disabled={busy || !ready || !configured}
          style={{ "--btn-lip": "var(--grape-deep)" } as React.CSSProperties}
          className="btn-chunky flex items-center gap-2 rounded-xl bg-grape px-4 py-2.5 text-sm text-white disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          {confirming ? `Yes — wake ${reach}` : "Send"}
        </button>
        {confirming && (
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-xl px-3 py-2.5 text-sm font-bold text-zinc-500 hover:text-zinc-300"
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
  area,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder: string;
  area?: boolean;
}) {
  const Tag = area ? "textarea" : "input";
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
        rows={area ? 2 : undefined}
        placeholder={placeholder}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          onChange(e.target.value)
        }
        className="field w-full px-4 py-2.5"
      />
    </label>
  );
}
