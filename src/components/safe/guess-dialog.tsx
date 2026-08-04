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

import { useEffect, useRef } from "react";
import { Delete, KeyRound } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { ALPHABET_SET, MAX_GUESS_LENGTH } from "@/lib/constants";
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
      title="Crack the safe"
      subtitle="Case matters. Anything on a keyboard is fair game."
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
        <div className="relative rounded-2xl border-2 border-white/12 bg-black/30 transition focus-within:border-brass">
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
            onChange={(e) => onChange(clean(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            className="w-full rounded-2xl bg-transparent py-4 pl-4 pr-12 font-mono text-lg font-bold tracking-wide text-foreground outline-none placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-zinc-500"
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
        <p className="px-1 font-mono text-xs text-zinc-500">
          {value.length} character{value.length === 1 ? "" : "s"}
          {known !== null && (
            <span className={over ? "text-mark-orange" : under ? "text-sky" : "text-mark-green"}>
              {" "}
              / {known}
            </span>
          )}
        </p>
      </div>
    </Modal>
  );
}

/** Everything the alphabet allows, and nothing it doesn't. */
function clean(raw: string): string {
  let out = "";
  for (const ch of raw) if (ALPHABET_SET.has(ch)) out += ch;
  return out.slice(0, MAX_GUESS_LENGTH);
}
