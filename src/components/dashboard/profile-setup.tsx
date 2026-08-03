"use client";

// The one-screen setup a new contributor sees.
//
// Deliberately not an onboarding flow. A contributor is a person, not a
// business — there is no trading name, no logo, no category, no verification.
// A name to show on the box and a handle for the link, and they're building.

import { useState } from "react";
import { DISPLAY_NAME_MAX, HANDLE_REGEX } from "@/lib/constants";
import { INPUT, Panel, PRIMARY } from "./shared";

/** "Ada Obi" → "ada-obi". Only a starting point; the field stays editable. */
function toHandle(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

export function ProfileSetup({ onDone }: { onDone: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveHandle = touched ? handle : toHandle(displayName);

  async function save() {
    if (!displayName.trim()) {
      setError("Pick a name for players to see.");
      return;
    }
    if (!HANDLE_REGEX.test(effectiveHandle)) {
      setError("Handles are 3–40 characters: lowercase letters, numbers, hyphens.");
      return;
    }

    setBusy(true);
    setError(null);
    const res = await fetch("/api/contributor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: displayName.trim(), handle: effectiveHandle }),
    });
    setBusy(false);
    if (res.ok) {
      onDone();
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setError(
      body.error === "handle_taken"
        ? "That handle is taken. Try another."
        : "Couldn't save that. Try again."
    );
  }

  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="text-2xl font-bold tracking-tight">One thing first</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Players see this on every box you put up.
      </p>

      <Panel>
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-zinc-400">Your name</span>
            <input
              autoFocus
              maxLength={DISPLAY_NAME_MAX}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ada Obi"
              className={`mt-1 ${INPUT}`}
            />
          </label>

          <label className="block">
            <span className="text-sm text-zinc-400">Handle</span>
            <input
              value={effectiveHandle}
              onChange={(e) => {
                setTouched(true);
                setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
              }}
              placeholder="ada-obi"
              className={`mt-1 ${INPUT} font-mono`}
            />
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button type="button" disabled={busy} onClick={() => void save()} className={`w-full ${PRIMARY}`}>
            {busy ? "Saving…" : "Start building"}
          </button>
        </div>
      </Panel>
    </div>
  );
}
