"use client";

import { useState } from "react";
import { Store } from "lucide-react";
import { SLUG_REGEX } from "@/lib/constants";

export function OnboardingForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [businessName, setBusinessName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!SLUG_REGEX.test(slug)) {
      setError(
        "Link name must be 3-40 characters: lowercase letters, numbers, and dashes."
      );
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/merchant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessName, slug }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        body?.error === "slug_taken"
          ? "That link name is taken — try another."
          : "Couldn't create your profile. Check the fields and try again."
      );
      return;
    }
    await onCreated();
  }

  return (
    <form onSubmit={submit} className="card mt-6 max-w-md p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-900">
        <Store className="size-5 text-emerald-600" aria-hidden />
        Set up your business
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        Pick a name and the link your customers will visit.
      </p>
      <label className="mt-5 block">
        <span className="field-label">Business name</span>
        <input
          required
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="Mama Put Kitchen"
          className="input-field"
        />
      </label>
      <label className="mt-4 block">
        <span className="field-label">Shareable link name</span>
        <div className="flex items-center rounded-xl border border-zinc-300 bg-white transition focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20">
          <span className="pl-3.5 text-zinc-400">/g/</span>
          <input
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="mama-put-kitchen"
            className="w-full bg-transparent px-1 py-2.5 text-zinc-900 placeholder-zinc-400 outline-none"
          />
        </div>
      </label>
      {error && <p className="alert-error mt-4">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary mt-5">
        {busy ? "Creating…" : "Create profile"}
      </button>
    </form>
  );
}
