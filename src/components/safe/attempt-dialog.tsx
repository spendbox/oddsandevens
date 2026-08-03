"use client";

// One attempt, read properly.
//
// The log row has to be scannable, so it compresses the verdict into icons and
// two numbers. That's right for skimming three hundred rows and wrong for the
// moment you stop on one and think — which is most of the game. This is that
// moment: the guess in full, each part of the verdict spelled out in words,
// and what it does and doesn't tell you.

import { CircleSlash, MoveDown, MoveUp, Target } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { plural } from "@/lib/plural";
import type { AttemptRecord } from "@/lib/types";

const LENGTH_COPY = {
  shorter: {
    icon: MoveUp,
    title: "Too short",
    body: "The password has more characters than this guess. Add some.",
    tone: "text-sky-300",
  },
  longer: {
    icon: MoveDown,
    title: "Too long",
    body: "The password has fewer characters than this guess. Take some away.",
    tone: "text-sky-300",
  },
  exact: {
    icon: Target,
    title: "Right length",
    body: "This guess is exactly as long as the password.",
    tone: "text-mark-green",
  },
} as const;

export function AttemptDialog({
  attempt,
  onClose,
}: {
  attempt: AttemptRecord;
  onClose: () => void;
}) {
  const length = LENGTH_COPY[attempt.lengthHint];
  const Icon = length.icon;
  const landed = attempt.exact > 0 || attempt.miscase > 0;

  return (
    <Modal
      title={`Attempt ${attempt.ordinal + 1}`}
      subtitle={new Date(attempt.at).toLocaleString()}
      width="sm"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-brass px-4 py-3 font-semibold text-zinc-950 transition hover:bg-brass-bright"
        >
          Back to the hunt
        </button>
      }
    >
      <div className="space-y-4 pb-1">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">You typed</p>
          {/* `break-all`: a 40-character guess has no spaces to break on. */}
          <code className="mt-1 block break-all rounded-xl bg-zinc-100 px-3 py-2.5 font-mono text-base text-zinc-900">
            {attempt.value}
          </code>
          <p className="mt-1 text-xs text-zinc-500">
            {plural(attempt.value.length, "character")}
          </p>
        </div>

        <Verdict
          icon={<Icon className={`size-4 ${length.tone}`} aria-hidden />}
          title={length.title}
          body={length.body}
        />

        <Verdict
          icon={<Dot tone="green" />}
          title={
            attempt.exact === 0
              ? "Nothing exactly right"
              : `${plural(attempt.exact, "character")} exactly right`
          }
          body={
            attempt.exact === 0
              ? "No position held the right character in the right case."
              : `${attempt.exact === 1 ? "One position" : `${attempt.exact} positions`} held the right character, in the right case. You aren't told which.`
          }
        />

        <Verdict
          icon={<Dot tone="orange" />}
          title={
            attempt.miscase === 0
              ? "Nothing in the wrong case"
              : `${plural(attempt.miscase, "character")} right, wrong case`
          }
          body={
            attempt.miscase === 0
              ? "No position held the right letter in the wrong case."
              : `${attempt.miscase === 1 ? "One position" : `${attempt.miscase} positions`} held the right letter but the wrong case — flip it and ${attempt.miscase === 1 ? "it becomes" : "they become"} exact. You aren't told which.`
          }
        />

        {!landed && (
          <Verdict
            icon={<CircleSlash className="size-4 text-zinc-400" aria-hidden />}
            title="Nothing landed"
            body="Not one position matched. Worth remembering: a character that's in the password but in the wrong place scores nothing here, so this guess may still contain the right letters."
          />
        )}
      </div>
    </Modal>
  );
}

function Verdict({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 border-t border-zinc-100 pt-3">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        <p className="mt-0.5 text-sm leading-snug text-zinc-500">{body}</p>
      </div>
    </div>
  );
}

function Dot({ tone }: { tone: "green" | "orange" }) {
  return (
    <span
      className={
        "block size-3.5 rounded-full " +
        (tone === "green" ? "bg-mark-green" : "bg-mark-orange")
      }
      aria-hidden
    />
  );
}
