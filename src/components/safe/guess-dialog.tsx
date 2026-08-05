"use client";

// Where you type a guess, now that the field has left the scene.
//
// An input box sitting permanently under the vault was the last thing on this
// screen that looked like a form. It also cost the scene a fifth of its height
// for something that is only wanted at the moment of a guess — and on a phone
// it summoned the keyboard the instant the page loaded, which covered the
// vault before anybody had looked at it.
//
// So the screen has one big button on it, and this is what the button opens.
// The trade is one tap per guess. What it buys is a play screen that is the
// game rather than a page with the game on it, and a keyboard that appears
// exactly when there is something to type into.

import { useEffect, useRef, useState } from "react";
import { Delete, KeyRound, Keyboard } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { MascotShow } from "./mascot-show";
import { MAX_GUESS_LENGTH } from "@/lib/constants";
import { allowedSet, CharsetDialog, useAlphabet } from "@/components/charset-dialog";
import type { Revealed } from "@/lib/game/power-ups";

export function GuessDialog({
  value,
  onChange,
  onSubmit,
  busy,
  revealed,
  onClose,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  busy: boolean;
  revealed: Revealed;
  onClose: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const alphabet = useAlphabet();
  const [chars, setChars] = useState(false);

  useEffect(() => {
    // A dialog whose only purpose is a text field should arrive with the
    // cursor already in it.
    const id = window.setTimeout(() => ref.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, []);

  const known = revealed.length;
  const over = known !== null && value.length > known;
  const under = known !== null && value.length > 0 && value.length < known;

  return (
    <Modal
      above={<MascotShow className="mb-1" />}
      title="Crack the safe"
      subtitle="Case matters."
      icon={<KeyRound className="size-5 text-brass" aria-hidden />}
      width="sm"
      onClose={onClose}
      footer={
        <button
          type="button"
          disabled={busy || value.length === 0}
          onClick={onSubmit}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky w-full rounded-2xl bg-brass px-4 py-4 text-lg text-ink"
        >
          {busy ? "Trying it…" : "Try it"}
        </button>
      }
    >
      <div className="space-y-2 pb-1">
        {/*
          The field lights its own border and nothing else.

          It used to be a bordered wrapper around a plain input, which meant
          the input was not a `.field` — so the site's global keyboard ring
          (`:focus-visible:not(.field)`, three gold pixels two pixels *outside*
          the box) landed on it. The dialog's body is the scroll container and
          the field is the first thing in it, so that ring was drawn straight
          into the clip edge and arrived on screen with its top shaved off.
          One element, one border, drawn inside its own box.
        */}
        <div className="relative">
          <input
            ref={ref}
            value={value}
            disabled={busy}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            maxLength={MAX_GUESS_LENGTH}
            aria-label="Your guess"
            placeholder="Type a password…"
            onChange={(e) => onChange(clean(e.target.value, allowedSet(alphabet)))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            className="field py-4 pl-4 pr-12 font-mono text-lg font-bold tracking-wide placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal"
          />

          {value.length > 0 && !busy && (
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label="Clear"
              className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 transition hover:text-zinc-200"
            >
              <Delete className="size-4" aria-hidden />
            </button>
          )}
        </div>

        {/*
          The character count, and nothing else. What used to sit beside it —
          "costs 1 life · 4 left" — is gone: the life pool is in the header
          where it belongs, and a price tag on the only button in the game is a
          reason to hesitate over something free.
        */}
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="font-mono text-xs text-zinc-500">
            {value.length} character{value.length === 1 ? "" : "s"}
            {known !== null && (
              <span className={over ? "text-mark-orange" : under ? "text-sky" : "text-mark-green"}>
                {" "}
                / {known}
              </span>
            )}
          </p>

          {/* What the password could possibly be made of. It sits on the one
              screen where the question comes up, and several of the characters
              in it can only realistically be entered by copying them out of
              it. */}
          <button
            type="button"
            onClick={() => setChars(true)}
            className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-bold text-zinc-500 transition hover:text-brass"
          >
            <Keyboard className="size-3.5" aria-hidden />
            {alphabet.guess.length} characters allowed
          </button>
        </div>
      </div>

      {chars && <CharsetDialog alphabet={alphabet} onClose={() => setChars(false)} />}
    </Modal>
  );
}

/**
 * Everything the alphabet allows, and nothing it doesn't.
 *
 * The set is passed in rather than imported because the alphabet is a setting
 * now: a symbol an admin added this morning must be typeable this afternoon,
 * and one they removed must still be typeable in a safe created before they
 * removed it. Both of those are decided by the server and mirrored here.
 */
function clean(raw: string, allowed: Set<string>): string {
  let out = "";
  for (const ch of raw) if (allowed.has(ch)) out += ch;
  return out.slice(0, MAX_GUESS_LENGTH);
}
