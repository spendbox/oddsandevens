"use client";

// "Something's wrong here."
//
// A game that takes money and hands out money needs a way to be told when it
// misbehaves, and it needs that way to be reachable from inside the moment it
// misbehaved. A support address in a footer is a support address nobody uses:
// by the time somebody has found it, gone to their email client and described
// what they were doing, the report has lost the two things that make it
// actionable — the screen and the state.
//
// So the button is wherever it might be needed, it opens over whatever is
// already there, and it sends the screen along with the words. It is a text
// box and a Send: there is no category dropdown, because a person who has just
// lost a life to a bug should not be asked to triage it first.
//
// Nothing here is a gate on anything. If it fails, it says so and the message
// stays in the box so a second try costs one tap rather than retyping.

import { useState } from "react";
import { LifeBuoy, Send } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Boxy } from "@/components/art/boxy";

export function ReportIssueButton({
  /** Where they are. Sent with the report so we know what they were looking at. */
  context,
  className,
  label = "Report an issue",
}: {
  context: string;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs font-bold text-zinc-500 transition hover:text-brass"
        }
      >
        <LifeBuoy className="size-3.5" aria-hidden />
        {label}
      </button>
      {open && <ReportDialog context={context} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ReportDialog({
  context,
  onClose,
}: {
  context: string;
  onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (message.trim().length < 5) {
      setError("A sentence or two is enough — we just need something to go on.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, email, context }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setSent(true);
        return;
      }
      setError(
        body.error === "too_many"
          ? "That's a few reports in a short while. Give it ten minutes."
          : "That didn't send. Try again in a moment — your message is still here."
      );
    } catch {
      setError("That didn't send. Try again in a moment — your message is still here.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={sent ? "Thank you" : "Report an issue"}
      subtitle={sent ? undefined : "Tell us what happened. We read every one."}
      icon={<LifeBuoy className="size-5 text-sky" aria-hidden />}
      width="sm"
      onClose={onClose}
      footer={
        sent ? (
          <button
            type="button"
            onClick={onClose}
            style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
            className="btn-chunky w-full rounded-2xl bg-brass px-4 py-3.5 text-ink"
          >
            Back to it
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
            className="btn-chunky flex w-full items-center justify-center gap-2 rounded-2xl bg-brass px-4 py-3.5 text-ink disabled:opacity-60"
          >
            <Send className="size-4" aria-hidden />
            {busy ? "Sending…" : "Send it"}
          </button>
        )
      }
    >
      {sent ? (
        <div className="animate-fade-up space-y-3 py-2 text-center">
          <Boxy mood="happy" className="mx-auto size-24 drop-shadow-2xl" />
          <p className="text-sm leading-relaxed text-zinc-300">
            That&apos;s with us. If you left an address we&apos;ll reply to it —
            otherwise it still gets read, and it still gets fixed.
          </p>
        </div>
      ) : (
        <div className="space-y-3 pb-1">
          <label className="block">
            <span className="text-sm text-zinc-500">What went wrong?</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={4000}
              autoFocus
              placeholder="A guess took a life but didn't score…"
              className="field mt-1.5 w-full resize-none px-3 py-2.5 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-sm text-zinc-500">
              Your email <span className="text-zinc-600">— optional, for a reply</span>
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={200}
              autoComplete="email"
              placeholder="you@example.com"
              className="field mt-1.5 w-full px-3 py-2.5 text-sm"
            />
          </label>

          <p className="text-[11px] leading-relaxed text-zinc-600">
            We send the screen you were on and your browser version along with
            this. Nothing else — no password, no card details, and never the
            contents of a safe.
          </p>

          {error && (
            <p className="rounded-xl bg-berry/15 px-3 py-2 text-sm font-bold text-berry">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
