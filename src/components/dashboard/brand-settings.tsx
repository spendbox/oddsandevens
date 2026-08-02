"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ImagePlus,
  Link2,
  Mail,
  MessageCircle,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type { Merchant } from "./shared";

export function BrandSettings({
  merchant,
  onSaved,
}: {
  merchant: Merchant;
  onSaved: () => Promise<void>;
}) {
  const [businessName, setBusinessName] = useState(merchant.business_name);
  const [tagline, setTagline] = useState(merchant.tagline ?? "");
  const [brandColor, setBrandColor] = useState(merchant.brand_color);
  const [whatsapp, setWhatsapp] = useState(merchant.whatsapp ?? "");
  const [contactEmail, setContactEmail] = useState(merchant.contact_email ?? "");
  const [logoPreview, setLogoPreview] = useState<string | null>(
    merchant.logo_url
  );
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    const form = new FormData();
    form.set("businessName", businessName);
    form.set("tagline", tagline);
    form.set("brandColor", brandColor);
    form.set("whatsapp", whatsapp);
    form.set("contactEmail", contactEmail);
    const file = logoInputRef.current?.files?.[0];
    if (file) form.set("logo", file);

    const res = await fetch("/api/merchant/profile", {
      method: "POST",
      body: form,
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        {
          invalid_slug:
            "Link name must be 3-40 characters: lowercase letters, numbers, and dashes.",
          slug_taken: "That link name is taken — try another.",
          invalid_logo_type: "Logo must be a PNG, JPEG, or WebP image.",
          logo_too_large: "Logo must be under 1 MB.",
          invalid_brand_color: "Brand color must be a hex value like #059669.",
          invalid_whatsapp:
            "WhatsApp number should be digits (with optional +), e.g. +2348012345678.",
          invalid_contact_email: "Contact email doesn't look valid.",
        }[String(body?.error)] ?? "Couldn't save your settings. Try again."
      );
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await onSaved();
  }

  return (
    <form onSubmit={submit}>
      <div className="flex flex-wrap items-start gap-5">
        <div>
          <span className="field-label">Logo</span>
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            className="flex size-20 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-zinc-300 text-zinc-400 transition hover:border-emerald-500 hover:text-emerald-600"
          >
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL / remote host not known at build time
              <img src={logoPreview} alt="Logo preview" className="size-full object-cover" />
            ) : (
              <ImagePlus className="size-6" aria-hidden />
            )}
          </button>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setLogoPreview(URL.createObjectURL(f));
            }}
          />
        </div>

        <div className="min-w-56 grow space-y-4">
          <label className="block">
            <span className="field-label">Business name</span>
            <input
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="input-field"
            />
          </label>
          <label className="block">
            <span className="field-label">Tagline</span>
            <input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              maxLength={140}
              placeholder="The best jollof in town — find the golden tile!"
              className="input-field"
            />
          </label>
        </div>

        <label className="block">
          <span className="field-label">Brand color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value.toLowerCase())}
              className="size-11 cursor-pointer rounded-lg border border-zinc-300 bg-white p-1"
              aria-label="Brand color"
            />
            <input
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value.toLowerCase())}
              className="input-field w-28 font-mono text-sm"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-400">
            Colors your customers&apos; board
          </p>
        </label>
      </div>

      <div className="mt-5 grid gap-4 border-t border-zinc-100 pt-4 sm:grid-cols-2">
        <label className="block">
          <span className="field-label flex items-center gap-1.5">
            <MessageCircle className="size-3.5" aria-hidden />
            WhatsApp number
          </span>
          <input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="+234 801 234 5678"
            className="input-field"
          />
          <p className="mt-1 text-[11px] text-zinc-400">
            Customers reach you via the board&apos;s contact button.
          </p>
        </label>
        <label className="block">
          <span className="field-label flex items-center gap-1.5">
            <Mail className="size-3.5" aria-hidden />
            Contact email
          </span>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="hello@yourbusiness.com"
            className="input-field"
          />
        </label>
      </div>

      {error && <p className="alert-error mt-4">{error}</p>}
      <button type="submit" disabled={busy} className="btn-primary mt-4">
        {busy ? (
          "Saving…"
        ) : saved ? (
          <>
            <Check className="size-4" aria-hidden /> Saved
          </>
        ) : (
          "Save settings"
        )}
      </button>

    </form>
  );
}

/**
 * The one setting that can break something already in the world.
 *
 * A business's link is printed on receipts and stuck to counters. Changing it
 * is a legitimate thing to want and a terrible thing to do by accident, so it
 * sits apart from the rest and asks twice.
 */
export function DangerZone({
  merchant,
  onSaved,
}: {
  merchant: Merchant;
  onSaved: () => Promise<void>;
}) {
  const [slug, setSlug] = useState(merchant.slug);
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugDraft, setSlugDraft] = useState(merchant.slug);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [slugBusy, setSlugBusy] = useState(false);

  async function saveSlug() {
    setSlugBusy(true);
    setSlugError(null);
    const form = new FormData();
    form.set("slug", slugDraft);
    const res = await fetch("/api/merchant/profile", {
      method: "POST",
      body: form,
    });
    setSlugBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setSlugError(
        {
          invalid_slug:
            "Link name must be 3-40 characters: lowercase letters, numbers, and dashes.",
          slug_taken: "That link name is taken — try another.",
        }[String(body?.error)] ?? "Couldn't update the link. Try again."
      );
      return;
    }
    setSlug(slugDraft);
    setEditingSlug(false);
    await onSaved();
  }

  return (
    <div>
      <p className="text-sm text-zinc-600">
        This is the link your customers open. It&apos;s probably printed on
        something by now — change it and the old one stops working the moment
        you save.
      </p>
      <button
        type="button"
        onClick={() => {
          setSlugDraft(slug);
          setSlugError(null);
          setEditingSlug(true);
        }}
        className="mt-3 flex w-full items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-left transition hover:border-rose-400"
        aria-label="Change customer link"
      >
        <Link2 className="size-4 shrink-0 text-zinc-400" aria-hidden />
        <span className="truncate font-mono text-sm text-zinc-900">
          /p/{slug}
        </span>
        <span className="ml-auto shrink-0 text-xs font-semibold text-rose-600">
          Change
        </span>
      </button>

      {editingSlug && (
        <Modal
          title="Change customer link"
          icon={<Link2 className="size-5 text-rose-500" aria-hidden />}
          width="sm"
          onClose={() => setEditingSlug(false)}
          footer={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditingSlug(false)}
                className="btn-secondary grow"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveSlug}
                disabled={slugBusy || slugDraft === slug}
                className="btn-primary grow"
              >
                {slugBusy ? "Saving…" : "Change link"}
              </button>
            </div>
          }
        >
          <div className="flex items-center rounded-xl border border-zinc-300 bg-white transition focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-500/20">
            <span className="pl-3.5 text-zinc-400">/p/</span>
            <input
              value={slugDraft}
              onChange={(e) => setSlugDraft(e.target.value.toLowerCase())}
              className="w-full bg-transparent px-1 py-2.5 font-mono text-zinc-900 outline-none"
            />
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-600">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Your old link stops working the moment you save. Reshare the new one
            with your customers.
          </p>
          {slugError && <p className="alert-error mt-3">{slugError}</p>}
        </Modal>
      )}
    </div>
  );
}
