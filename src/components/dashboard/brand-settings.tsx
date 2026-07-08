"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  BadgePercent,
  Check,
  ImagePlus,
  Link2,
  Mail,
  MessageCircle,
  Palette,
  X,
} from "lucide-react";
import type { Merchant } from "./shared";

export function BrandSettings({
  merchant,
  onSaved,
}: {
  merchant: Merchant;
  onSaved: () => Promise<void>;
}) {
  const [businessName, setBusinessName] = useState(merchant.business_name);
  const [slug, setSlug] = useState(merchant.slug);
  const [tagline, setTagline] = useState(merchant.tagline ?? "");
  const [brandColor, setBrandColor] = useState(merchant.brand_color);
  const [whatsapp, setWhatsapp] = useState(merchant.whatsapp ?? "");
  const [contactEmail, setContactEmail] = useState(merchant.contact_email ?? "");
  const [pointsPerDiscount, setPointsPerDiscount] = useState(
    merchant.points_per_discount
  );
  const [discountPercent, setDiscountPercent] = useState(
    merchant.discount_percent
  );
  const [logoPreview, setLogoPreview] = useState<string | null>(
    merchant.logo_url
  );
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // Slug editing lives in a confirm popup (the "danger zone" below): changing
  // it breaks the old link, so it's deliberately not a casual inline field.
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugDraft, setSlugDraft] = useState(slug);
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
    form.set("pointsPerDiscount", String(pointsPerDiscount));
    form.set("discountPercent", String(discountPercent));
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
          invalid_loyalty_settings:
            "Points and discount must be whole numbers between 1 and 100.",
        }[String(body?.error)] ?? "Couldn't save your settings. Try again."
      );
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await onSaved();
  }

  return (
    <form onSubmit={submit} className="card p-4 sm:p-6">
      <h2 className="section-title">
        <Palette className="size-3.5" aria-hidden />
        Brand & loyalty settings
      </h2>

      <div className="mt-4 flex flex-wrap items-start gap-5">
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

      <div className="mt-5 border-t border-zinc-100 pt-4">
        <span className="field-label flex items-center gap-1.5">
          <BadgePercent className="size-3.5" aria-hidden />
          Loyalty exchange rate
        </span>
        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
          <input
            type="number"
            min={1}
            max={100}
            value={pointsPerDiscount}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setPointsPerDiscount(Number(e.target.value))}
            className="input-field w-20"
            aria-label="Points required"
          />
          <span>points =</span>
          <input
            type="number"
            min={1}
            max={100}
            value={discountPercent}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDiscountPercent(Number(e.target.value))}
            className="input-field w-20"
            aria-label="Discount percent"
          />
          <span>% discount</span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
          A miss earns 1 point. At {pointsPerDiscount} point
          {pointsPerDiscount === 1 ? "" : "s"} the customer unlocks{" "}
          {discountPercent}% off — they show their loyalty code at the counter,
          you enter it, and their points reset. Points expire 7 days after their
          last tap.
        </p>
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

      {/* Danger zone: the customer link. Tapping it opens a confirm popup. */}
      <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50/50 p-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-rose-600">
          <AlertTriangle className="size-3.5" aria-hidden />
          Danger zone
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <span className="field-label">Customer link</span>
            <button
              type="button"
              onClick={() => {
                setSlugDraft(slug);
                setSlugError(null);
                setEditingSlug(true);
              }}
              className="flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-left transition hover:border-rose-400"
              aria-label="Edit customer link"
            >
              <Link2 className="size-4 shrink-0 text-zinc-400" aria-hidden />
              <span className="truncate font-mono text-sm text-zinc-900">
                /g/{slug}
              </span>
            </button>
          </div>
          <p className="max-w-xs text-[11px] leading-relaxed text-rose-600">
            Tap the link to change it. Changing it breaks the old link — anyone
            with the old one will need the new address.
          </p>
        </div>
      </div>

      {editingSlug && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-6 backdrop-blur-sm"
          onClick={() => setEditingSlug(false)}
        >
          <div
            className="animate-pop-in card w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-900">
                <Link2 className="size-5 text-rose-500" aria-hidden />
                Change customer link
              </h3>
              <button
                type="button"
                onClick={() => setEditingSlug(false)}
                className="btn-ghost"
                aria-label="Close"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="mt-4 flex items-center rounded-xl border border-zinc-300 bg-white transition focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-500/20">
              <span className="pl-3.5 text-zinc-400">/g/</span>
              <input
                autoFocus
                value={slugDraft}
                onChange={(e) => setSlugDraft(e.target.value.toLowerCase())}
                className="w-full bg-transparent px-1 py-2.5 font-mono text-zinc-900 outline-none"
              />
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-600">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Your old link stops working the moment you save. Reshare the new
              one with your customers.
            </p>
            {slugError && <p className="alert-error mt-3">{slugError}</p>}
            <div className="mt-4 flex gap-2">
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
          </div>
        </div>
      )}
    </form>
  );
}
