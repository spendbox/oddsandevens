"use client";

// Putting a business behind one of our own boxes, after it is already on the
// board.
//
// The create form asks the same five questions, and for the same reason the
// prize is editable it cannot be the only place that ever does: a sponsorship
// is signed the week after the safe went up at least as often as before it, and
// the alternative to this dialog is deleting a box that has hunters on it and
// rebuilding it under a new slug.
//
// It is also the only way to *end* one. A deal that lapses has to come off the
// board, and emptying the name does it — which is why this saves an empty
// sponsorship as a real answer rather than treating a blank form as nothing to
// do. The preview underneath is the whole point of the dialog being a dialog:
// this is content going onto a public page, and an admin should see it drawn
// the way a player will see it before it goes there.

import { useState } from "react";
import { Handshake } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { SponsorChip, SponsorPrize } from "@/components/sponsor";
import {
  EMPTY_SPONSOR,
  SponsorFields,
  sponsorPayload,
  type SponsorDraft,
} from "@/components/admin/sponsor-fields";
import type { Sponsor } from "@/lib/types";

export function SponsorDialog({
  boxId,
  boxTitle,
  sponsor,
  onClose,
  onSaved,
}: {
  boxId: string;
  boxTitle: string;
  /** What is on the box now. Null is an ordinary box, which is a real answer. */
  sponsor: Sponsor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<SponsorDraft>(() => toDraft(sponsor));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const named = draft.name.trim().length > 0;
  const clearing = !named && !!sponsor;
  // Drawn from the draft rather than from what is saved, so the preview tracks
  // every keystroke. A preview of the old value is worse than no preview.
  const preview = named ? toSponsor(draft) : null;

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/boxes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boxId, sponsor: sponsorPayload(draft) }),
    });
    setBusy(false);

    if (res.ok) {
      onSaved();
      onClose();
      return;
    }

    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(
      body.error === "not_ours"
        ? "That box belongs to a contributor. A sponsorship is ours to sign, so it can only go on one of our own boxes."
        : body.error === "invalid_email"
          ? "That email address doesn't look right. Check it, or leave it blank to keep the one already on file."
          : body.error === "invalid_logo" || body.error === "invalid_media"
            ? "That file isn't one of ours. Upload it again."
            : "Couldn't save that. Try again in a moment."
    );
  }

  return (
    <Modal
      title="The sponsor"
      subtitle={boxTitle}
      icon={<Handshake className="size-6 text-grape" aria-hidden />}
      width="md"
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          style={
            {
              "--btn-lip": clearing ? "var(--berry-deep)" : "var(--grape-deep)",
            } as React.CSSProperties
          }
          className={
            "btn-chunky w-full rounded-2xl px-4 py-3.5 " +
            (clearing ? "bg-berry text-white" : "bg-grape text-white")
          }
        >
          {busy
            ? "Saving…"
            : clearing
              ? "Take the sponsor off this box"
              : named
                ? `Put ${draft.name.trim()} on this box`
                : "Nothing to save"}
        </button>
      }
    >
      <div className="space-y-4 pb-1">
        <SponsorFields draft={draft} onChange={setDraft} />

        {/*
          What a player will see. Both pieces, because they appear in different
          places and are read at different moments: the chip goes on every card
          and rail, the panel goes in the vault sheet and on the win screen.
        */}
        {preview && (
          <div className="border-t border-white/10 pt-4">
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">
              How it will look
            </p>
            <SponsorChip sponsor={preview} />
            {preview.prize && <SponsorPrize sponsor={preview} className="mt-3" />}
          </div>
        )}

        {error && (
          <p className="rounded-xl bg-berry/15 px-3 py-2 text-sm font-bold text-berry">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function toDraft(sponsor: Sponsor | null): SponsorDraft {
  if (!sponsor) return EMPTY_SPONSOR;
  return {
    name: sponsor.name,
    // Never sent to a browser, so the dialog cannot prefill it — see 0055.
    // Leaving it blank on an edit is correct rather than lossy: an empty
    // address means "don't change who is on file", and the route only writes
    // one when something was typed.
    email: "",
    logoUrl: sponsor.logoUrl ?? "",
    prizeTitle: sponsor.prize?.title ?? "",
    prizeBlurb: sponsor.prize?.blurb ?? "",
    prizeMediaUrl: sponsor.prize?.media?.url ?? "",
    prizeMediaKind: sponsor.prize?.media?.kind ?? "",
  };
}

/**
 * The draft as the components draw it.
 *
 * Deliberately the same nesting rules `toSponsor` applies on the server — a
 * prize appears only once it has a title, media only once there is a prize —
 * so the preview is what will actually be rendered rather than an optimistic
 * version of it.
 */
function toSponsor(draft: SponsorDraft): Sponsor {
  const title = draft.prizeTitle.trim();
  return {
    name: draft.name.trim(),
    logoUrl: draft.logoUrl || null,
    prize: title
      ? {
          title,
          blurb: draft.prizeBlurb.trim() || null,
          media:
            draft.prizeMediaUrl && draft.prizeMediaKind
              ? { url: draft.prizeMediaUrl, kind: draft.prizeMediaKind }
              : null,
        }
      : null,
  };
}
