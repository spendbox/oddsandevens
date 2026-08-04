"use client";

// The field you type a guess into.
//
// It's a plain text input and that is the whole design goal. A guess can be
// anywhere from 1 to 40 characters, its length is a thing the player is
// actively probing, and case matters — none of which survives being chopped
// into fixed boxes. So: one wide monospaced field, the character count under
// it as the only chrome, and everything the player has paid to learn shown
// alongside rather than baked into the input.

import { useEffect, useRef } from "react";
import { Delete, KeyRound } from "lucide-react";
import { ALPHABET_SET, MAX_GUESS_LENGTH } from "@/lib/constants";
import type { Revealed } from "@/lib/game/power-ups";

export function PasswordField({
  value,
  onChange,
  onSubmit,
  disabled,
  busy,
  revealed,
  livesLeft,
  freeRun,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  busy: boolean;
  revealed: Revealed;
  livesLeft: number;
  /** Second Wind is running: this guess costs nothing at all. */
  freeRun: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

  // Focus follows the answer: after a guess resolves the field is empty and
  // ready, which is the difference between a hunt and a chore.
  useEffect(() => {
    if (!disabled && !busy) ref.current?.focus();
  }, [disabled, busy]);

  const known = revealed.length;
  const over = known !== null && value.length > known;
  const under = known !== null && value.length > 0 && value.length < known;

  return (
    <div className="space-y-2">
      <div
        className={
          "panel relative rounded-2xl border-2 transition " +
          (disabled ? "opacity-60" : "focus-within:border-brass focus-within:shadow-[0_0_0_4px_rgba(255,194,71,0.18)]")
        }
      >
        <KeyRound
          className="pointer-events-none absolute left-4 top-4 size-5 text-zinc-600"
          aria-hidden
        />

        <input
          ref={ref}
          value={value}
          disabled={disabled || busy}
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
          className="w-full rounded-2xl bg-transparent py-4 pl-12 pr-12 font-mono text-lg font-bold tracking-wide text-foreground outline-none placeholder:font-sans placeholder:font-normal placeholder:text-base placeholder:tracking-normal placeholder:text-zinc-500 sm:text-xl"
        />

        {value.length > 0 && !disabled && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear"
            className="absolute right-3 top-3.5 flex size-8 items-center justify-center rounded-lg text-zinc-600 transition hover:text-zinc-300"
          >
            <Delete className="size-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
        <span className="font-mono text-zinc-500">
          {value.length} character{value.length === 1 ? "" : "s"}
          {known !== null && (
            <span className={over ? "text-mark-orange" : under ? "text-sky-300" : "text-mark-green"}>
              {" "}
              / {known}
            </span>
          )}
        </span>

        <span className={freeRun ? "text-mark-green" : "text-zinc-600"}>
          {disabled
            ? " "
            : freeRun
              ? "Free — Second Wind is running"
              : livesLeft > 0
                ? `Costs 1 life · ${livesLeft} left`
                : "No lives left"}
        </span>
      </div>

      <button
        type="button"
        disabled={disabled || busy || value.length === 0}
        onClick={onSubmit}
        style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
        className="btn-chunky w-full rounded-2xl bg-brass px-4 py-4 text-lg text-ink"
      >
        {busy ? "Checking…" : "Crack it"}
      </button>
    </div>
  );
}

/**
 * Drops anything not in the alphabet as it's typed.
 *
 * Pasting is the reason this exists: people paste passwords with trailing
 * newlines and smart quotes, and a guess that silently fails validation after
 * costing a life would be unforgivable.
 */
function clean(raw: string): string {
  let out = "";
  for (const ch of raw) {
    if (ALPHABET_SET.has(ch)) out += ch;
  }
  return out.slice(0, MAX_GUESS_LENGTH);
}
