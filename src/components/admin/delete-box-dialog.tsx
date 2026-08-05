"use client";

// Deleting a box.
//
// A box is meant to be permanent — players spend weeks against one password and
// the record of that has to outlive anybody's change of heart. This is for the
// times that isn't enough: a password nobody could type, something abusive in
// a title, a duplicate from a payment that fired twice.
//
// It used to send a six-digit code to the administrator's inbox. The step that
// actually stops a mis-click is the one that remains: the first call reports
// what the deletion would destroy — the hunters, the attempts — and the box's
// own name has to be typed back before the button will do anything. A code
// proved possession of an inbox; it did not make anybody read the number of
// people whose fortnight they were about to erase.

import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Boxy } from "@/components/art/boxy";

interface Target {
  title: string;
  slug: string;
  status: string;
  attemptsCount: number;
  playersCount: number;
}

const LIGHT_INPUT =
  "field mt-1.5 px-4 py-3";

export function DeleteBoxDialog({
  boxId,
  boxTitle,
  onClose,
  onDeleted,
}: {
  boxId: string;
  boxTitle: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [step, setStep] = useState<"ask" | "confirm">("ask");
  const [target, setTarget] = useState<Target | null>(null);
  const [reason, setReason] = useState("");
  /** The box's own name, typed back. The only key this door has. */
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim().toLowerCase() === boxTitle.trim().toLowerCase();

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/boxes/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boxId, ...body }),
    });
    return { res, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }

  async function look() {
    setBusy(true);
    setError(null);
    const { res, body } = await post({ reason });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't start that. Try again in a moment.");
      return;
    }
    setTarget(body.box as Target);
    setStep("confirm");
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const { res } = await post({ confirm: true, reason });
    setBusy(false);
    if (!res.ok) {
      setError("Couldn't delete it. Try again in a moment.");
      return;
    }
    onDeleted();
    onClose();
  }

  return (
    <Modal
      title={step === "ask" ? "Delete this box?" : "Type its name to confirm"}
      subtitle={boxTitle}
      icon={<Boxy mood="dizzy" still />}
      width="sm"
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy || (step === "confirm" && !matches)}
          onClick={() => void (step === "ask" ? look() : confirm())}
          style={{ "--btn-lip": "var(--berry-deep)" } as React.CSSProperties}
          className="btn-chunky flex w-full items-center justify-center gap-2 rounded-2xl bg-berry px-4 py-3.5 text-ink"
        >
          <Trash2 className="size-4" aria-hidden />
          {busy ? "One moment…" : step === "ask" ? "Show me what it costs" : "Delete it permanently"}
        </button>
      }
    >
      <div className="space-y-4 pb-1">
        <div className="flex gap-3 rounded-2xl border border-berry/30 bg-berry/12 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-berry" aria-hidden />
          <p className="text-sm text-zinc-300">
            This cannot be undone. The box, every attempt made against it, and
            every hunt on it go with it. Money already taken is not refunded by
            deleting the box.
          </p>
        </div>

        {target && (
          <dl className="grid grid-cols-2 gap-2 rounded-2xl bg-black/25 p-3 text-sm">
            <Stat label="Status" value={target.status} />
            <Stat label="Hunters" value={String(target.playersCount)} />
            <Stat label="Attempts" value={String(target.attemptsCount)} />
            <Stat label="Slug" value={target.slug} />
          </dl>
        )}

        {step === "ask" ? (
          <label className="block">
            <span className="text-sm font-bold text-zinc-300">
              Why? (kept in the audit log)
            </span>
            <input
              value={reason}
              autoFocus
              onChange={(e) => setReason(e.target.value)}
              placeholder="Duplicate, abusive title, unplayable password…"
              className={LIGHT_INPUT}
            />
          </label>
        ) : (
          <label className="block">
            <span className="text-sm font-bold text-zinc-300">
              Type <span className="font-mono text-berry">{boxTitle}</span> to
              confirm
            </span>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={boxTitle}
              className={`${LIGHT_INPUT} font-mono`}
            />
          </label>
        )}

        {error && (
          <p className="rounded-xl bg-berry/15 px-3 py-2 text-sm font-bold text-berry">{error}</p>
        )}
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
        {label}
      </dt>
      <dd className="truncate font-mono text-foreground">{value}</dd>
    </div>
  );
}
