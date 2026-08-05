"use client";

// The alphabet, shown to whoever asks.
//
// Two people need this and they need it for opposite reasons. A hunter wants
// to know what a password could possibly contain, because that is the size of
// the space they are searching and half of it is symbols nobody expects to be
// allowed. A builder wants to know what they may type into the password field
// before they find out by being refused.
//
// The tap-to-copy is not a flourish. Several of these — √ π ÷ × § ∆ ✓ — are
// not on a phone keyboard's symbol pages and not on a desktop keyboard at all,
// so for those characters this sheet is the only practical way to enter them.
// A password game whose alphabet includes characters you cannot type is a
// worse game than one with a smaller alphabet.

import { useCallback, useEffect, useState } from "react";
import { Check, Keyboard } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { ALPHABET, DIGITS, LOWER, UPPER, visible } from "@/lib/constants";

interface Alphabet {
  /** Just the symbols — the part an admin can change. */
  symbols: string[];
  /** What a new password may contain. */
  alphabet: string[];
  /** What a guess may contain: the above, plus anything once standard. */
  guess: string[];
}

/**
 * The live alphabet, with the built-in one as the answer until it arrives.
 *
 * Starting from the built-in list rather than from nothing matters: this feeds
 * the filter on the guess field, and a filter that allows nothing for the
 * first eighty milliseconds would eat the first characters of a fast typist's
 * guess. The built-in list is always a subset of what the server accepts, so
 * the worst case is briefly refusing a symbol an admin has only just added.
 */
export function useAlphabet(): Alphabet {
  const [live, setLive] = useState<Alphabet | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/alphabet");
      if (!res.ok || cancelled) return;
      const body = (await res.json()) as Alphabet;
      if (!cancelled) setLive(body);
    })().catch(() => {
      // Offline, or the settings row is unreachable. The built-in list is a
      // perfectly good answer and the server is the one that decides anyway.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return live ?? BUILT_IN;
}

const BUILT_IN: Alphabet = {
  symbols: ALPHABET.filter((ch) => !/[a-z0-9]/i.test(ch)),
  alphabet: ALPHABET,
  guess: ALPHABET,
};

/** Everything a guess may contain, as a set — for filtering a field. */
export function allowedSet(alphabet: Alphabet): Set<string> {
  return new Set([...ALPHABET, ...alphabet.guess]);
}

export function CharsetDialog({
  alphabet,
  /**
   * Writing a password rather than guessing one.
   *
   * The two lists differ: a guess may contain anything that has ever been
   * standard, a new password only what is offered today. Showing a builder a
   * character they will then be refused for using would be worse than showing
   * them nothing.
   */
  creating = false,
  onClose,
}: {
  alphabet: Alphabet;
  creating?: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const all = creating ? alphabet.alphabet : alphabet.guess;

  const copy = useCallback((ch: string) => {
    setCopied(ch);
    void navigator.clipboard?.writeText(ch).catch(() => {});
    window.setTimeout(() => setCopied((current) => (current === ch ? null : current)), 1200);
  }, []);

  return (
    <Modal
      title="Every character allowed"
      subtitle={`${all.length} of them, at every single position`}
      icon={<Keyboard className="size-6 text-brass" aria-hidden />}
      width="md"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
          className="btn-chunky w-full rounded-2xl bg-brass px-4 py-3.5 text-ink"
        >
          Got it
        </button>
      }
    >
      <div className="space-y-4 pb-1">
        <p className="text-sm leading-relaxed text-zinc-400">
          {creating ? "Your password" : "A password"} is built from these and
          nothing else.{" "}
          <strong className="text-zinc-200">Case matters</strong> — the two
          letter rows are different characters. Tap any of them to copy it,
          which is the easy way in for the ones your keyboard doesn’t have.
        </p>

        <Row label="Capitals" chars={UPPER} copied={copied} onCopy={copy} />
        <Row label="Lowercase" chars={LOWER} copied={copied} onCopy={copy} />
        <Row label="Digits" chars={DIGITS} copied={copied} onCopy={copy} />
        <Row
          label="Symbols and the space"
          chars={all.filter((ch) => !/[a-z0-9]/i.test(ch))}
          copied={copied}
          onCopy={copy}
        />
      </div>
    </Modal>
  );
}

function Row({
  label,
  chars,
  copied,
  onCopy,
}: {
  label: string;
  chars: string[];
  copied: string | null;
  onCopy: (ch: string) => void;
}) {
  if (chars.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
        {label} <span className="text-zinc-600">· {chars.length}</span>
      </p>
      <div className="flex flex-wrap gap-1">
        {chars.map((ch) => (
          <button
            key={ch}
            type="button"
            onClick={() => onCopy(ch)}
            aria-label={ch === " " ? "Copy the space character" : `Copy ${ch}`}
            className={
              "flex size-8 items-center justify-center rounded-lg border-2 font-mono text-sm font-black transition " +
              (copied === ch
                ? "border-mint bg-mint/20 text-mint"
                : "border-white/12 bg-white/6 text-zinc-200 hover:border-brass/60 hover:text-brass")
            }
          >
            {copied === ch ? <Check className="size-3.5" aria-hidden /> : visible(ch)}
          </button>
        ))}
      </div>
    </div>
  );
}
