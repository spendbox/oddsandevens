"use client";

// Deleting a box, out of band.
//
// A box is meant to be permanent — players spend weeks against one password and
// the record of that has to outlive anybody's change of heart. This is for the
// times that isn't enough: a password nobody could type, something abusive in
// a title, a duplicate from a payment that fired twice.
//
// Because it is irreversible and takes other people's history with it, it is
// confirmed by a code emailed to the administrator rather than by a button. A
// mis-click becomes an email, and a hijacked admin session on its own is not
// enough to erase the board.

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
  "mt-1 w-full rounded-xl border-2 border-zinc-200 px-4 py-3 text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-berry";

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
  const [step, setStep] = useState<"ask" | "code">("ask");
  const [target, setTarget] = useState<Target | null>(null);
  const [sentTo, setSentTo] = useState("");
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/boxes/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boxId, ...body }),
    });
    return { res, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }

  async function requestCode() {
    setBusy(true);
    setError(null);
    const { res, body } = await post({ reason });
    setBusy(false);
    if (!res.ok) {
      setError(
        body.error === "too_many_codes"
          ? "Too many codes requested. Wait a few minutes."
          : "Couldn't start that. Try again in a moment."
      );
      return;
    }
    setTarget(body.box as Target);
    setSentTo(String(body.to ?? ""));
    setStep("code");
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    const { res, body } = await post({ code: code.trim(), reason });
    setBusy(false);
    if (!res.ok) {
      setError(
        body.error === "invalid_code"
          ? "That code is wrong or has expired."
          : "Couldn't delete it. Try again in a moment."
      );
      return;
    }
    onDeleted();
    onClose();
  }

  return (
    <Modal
      title={step === "ask" ? "Delete this box?" : "Confirm the deletion"}
      subtitle={step === "ask" ? boxTitle : `We emailed a code to ${sentTo}.`}
      icon={<Boxy mood="dizzy" still className="size-9" />}
      width="sm"
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy || (step === "code" && code.trim().length !== 6)}
          onClick={() => void (step === "ask" ? requestCode() : confirm())}
          style={{ "--btn-lip": "var(--berry-deep)" } as React.CSSProperties}
          className="btn-chunky flex w-full items-center justify-center gap-2 rounded-2xl bg-berry px-4 py-3.5 text-ink"
        >
          <Trash2 className="size-4" aria-hidden />
          {busy
            ? "One moment…"
            : step === "ask"
              ? "Email me a code"
              : "Delete it permanently"}
        </button>
      }
    >
      <div className="space-y-4 pb-1">
        <div className="flex gap-3 rounded-2xl bg-red-50 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
          <p className="text-sm text-red-800">
            This cannot be undone. The box, every attempt made against it, and
            every hunt on it go with it. Money already taken is not refunded by
            deleting the box.
          </p>
        </div>

        {target && (
          <dl className="grid grid-cols-2 gap-2 rounded-2xl bg-zinc-100 p-3 text-sm">
            <Stat label="Status" value={target.status} />
            <Stat label="Hunters" value={String(target.playersCount)} />
            <Stat label="Attempts" value={String(target.attemptsCount)} />
            <Stat label="Slug" value={target.slug} />
          </dl>
        )}

        {step === "ask" ? (
          <label className="block">
            <span className="text-sm font-semibold text-zinc-700">
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
            <span className="text-sm font-semibold text-zinc-700">The code</span>
            <input
              inputMode="numeric"
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className={`${LIGHT_INPUT} text-center font-mono text-2xl tracking-[0.4em]`}
            />
          </label>
        )}

        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
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
      <dd className="truncate font-mono text-zinc-800">{value}</dd>
    </div>
  );
}
