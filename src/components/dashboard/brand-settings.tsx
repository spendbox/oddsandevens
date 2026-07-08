"use client";

import { useRef, useState } from "react";
import {
  BadgePercent,
  Check,
  ImagePlus,
  Mail,
  MessageCircle,
  Palette,
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    const form = new FormData();
    form.set("businessName", businessName);
    form.set("slug", slug);
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
          <p className="mt-1.5 max-w-24 text-[11px] leading-tight text-zinc-400">
            PNG, JPEG, or WebP, up to 1 MB. Shown on your board&apos;s splash
            screen.
          </p>
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
            <span className="field-label">Customer link</span>
            <div className="flex items-center rounded-xl border border-zinc-300 bg-white transition focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20">
              <span className="pl-3.5 text-zinc-400">/g/</span>
              <input
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                className="w-full bg-transparent px-1 py-2.5 text-zinc-900 outline-none"
              />
            </div>
            <p className="mt-1 text-[11px] text-amber-600">
              Changing this breaks the old link — reshare the new one with
              your customers.
            </p>
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
            onChange={(e) => setDiscountPercent(Number(e.target.value))}
            className="input-field w-20"
            aria-label="Discount percent"
          />
          <span>% discount</span>
        </div>
        <p className="mt-1.5 text-xs text-zinc-400">
          Customers earn 1 point per play that doesn&apos;t hit a reward.
          Points stay valid for 7 days after their last play; customers redeem
          them at the counter with their loyalty code.
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
    </form>
  );
}
