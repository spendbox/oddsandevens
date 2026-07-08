"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  Crown,
  ExternalLink,
  Eye,
  EyeOff,
  ImagePlus,
  Landmark,
  LogOut,
  Shield,
  Store,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { PasswordInput } from "@/components/password-input";
import { useAutoRefresh } from "@/lib/use-auto-refresh";

interface AdminImage {
  id: string;
  title: string;
  url: string;
  is_active: boolean;
  created_at: string;
}

interface AdminMerchant {
  id: string;
  businessName: string;
  slug: string;
  tier: "free" | "premium";
  premiumExpiresAt: string | null;
  createdAt: string;
  customers: number;
  activeGrids: number;
}

interface AdminCustomer {
  id: string;
  email: string;
  createdAt: string;
  businesses: number;
  points: number;
  plays: number;
}

// Platform admin: curate the free grid-image library and set the premium
// price. Access is gated server-side by ADMIN_EMAILS — this page just renders
// whatever the /api/admin/* routes allow.
export default function AdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [images, setImages] = useState<AdminImage[]>([]);
  const [merchants, setMerchants] = useState<AdminMerchant[]>([]);
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [priceNaira, setPriceNaira] = useState("");
  const [freePlays, setFreePlays] = useState("");
  const [premiumPlays, setPremiumPlays] = useState("");
  const [topupPriceNaira, setTopupPriceNaira] = useState("");
  const [savedPrice, setSavedPrice] = useState(false);
  const [title, setTitle] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // Pure fetcher (no setState) so the mount effect can apply the result in an
  // async callback — required by the react-hooks/set-state-in-effect rule.
  const fetchAdminData = useCallback(async (): Promise<
    | { authorized: false }
    | {
        authorized: true;
        priceNaira: string;
        freePlays: string;
        premiumPlays: string;
        topupPriceNaira: string;
        images: AdminImage[];
        merchants: AdminMerchant[];
        customers: AdminCustomer[];
      }
  > => {
    const [settingsRes, imagesRes, merchantsRes, customersRes] =
      await Promise.all([
        fetch("/api/admin/settings"),
        fetch("/api/admin/images"),
        fetch("/api/admin/merchants"),
        fetch("/api/admin/customers"),
      ]);
    if (settingsRes.status === 401 || imagesRes.status === 401) {
      return { authorized: false };
    }
    const settings = await settingsRes.json().catch(() => null);
    const imgs = await imagesRes.json().catch(() => null);
    const merch = await merchantsRes.json().catch(() => null);
    const custs = await customersRes.json().catch(() => null);
    return {
      authorized: true,
      priceNaira: String((settings?.premiumPriceKobo ?? 0) / 100),
      freePlays: String(settings?.freeYearlyPlays ?? 0),
      premiumPlays: String(settings?.premiumYearlyPlays ?? 0),
      topupPriceNaira: String((settings?.topupPricePer1000Kobo ?? 0) / 100),
      images: (imgs?.images as AdminImage[]) ?? [],
      merchants: (merch?.merchants as AdminMerchant[]) ?? [],
      customers: (custs?.customers as AdminCustomer[]) ?? [],
    };
  }, []);

  const applyAdminData = useCallback(
    (data: Awaited<ReturnType<typeof fetchAdminData>>) => {
      if (!data.authorized) {
        setAuthorized(false);
        return;
      }
      setPriceNaira(data.priceNaira);
      setFreePlays(data.freePlays);
      setPremiumPlays(data.premiumPlays);
      setTopupPriceNaira(data.topupPriceNaira);
      setImages(data.images);
      setMerchants(data.merchants);
      setCustomers(data.customers);
      setAuthorized(true);
    },
    []
  );

  const load = useCallback(async () => {
    applyAdminData(await fetchAdminData());
  }, [fetchAdminData, applyAdminData]);

  // Keep the merchant/customer lists current without a manual reload.
  useAutoRefresh(
    useCallback(() => {
      if (authorized) void load();
    }, [authorized, load])
  );

  useEffect(() => {
    let ignore = false;
    fetchAdminData().then((data) => {
      if (!ignore) applyAdminData(data);
    });
    return () => {
      ignore = true;
    };
  }, [fetchAdminData, applyAdminData]);

  async function savePrice(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedPrice(false);
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        premiumPriceKobo: Math.round(Number(priceNaira) * 100),
        freeYearlyPlays: Math.round(Number(freePlays)),
        premiumYearlyPlays: Math.round(Number(premiumPlays)),
        topupPricePer1000Kobo: Math.round(Number(topupPriceNaira) * 100),
      }),
    });
    if (!res.ok) {
      setError(
        "Couldn't save — check the price is at least ₦100 and the tap counts are whole numbers."
      );
      return;
    }
    setSavedPrice(true);
    setTimeout(() => setSavedPrice(false), 2000);
  }

  async function uploadImage(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !title.trim()) {
      setError("Pick a file and give it a title.");
      return;
    }
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("title", title.trim());
    form.set("image", file);
    const res = await fetch("/api/admin/images", { method: "POST", body: form });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(
        {
          invalid_image_type: "Image must be PNG, JPEG, or WebP.",
          image_too_large: "Image must be under 3 MB.",
          invalid_title: "Title must be 1-80 characters.",
        }[String(body?.error)] ?? "Upload failed. Try again."
      );
      return;
    }
    setTitle("");
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
    await load();
  }

  async function toggleImage(img: AdminImage) {
    await fetch("/api/admin/images", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: img.id, isActive: !img.is_active }),
    });
    await load();
  }

  async function deleteImage(img: AdminImage) {
    if (!window.confirm(`Delete "${img.title}" from the library permanently?`)) {
      return;
    }
    await fetch("/api/admin/images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: img.id }),
    });
    await load();
  }

  async function deleteMerchant(m: AdminMerchant) {
    if (
      !window.confirm(
        `Delete "${m.businessName}" (/g/${m.slug}) and its account permanently? All grids, rewards, and codes go with it.`
      )
    ) {
      return;
    }
    const res = await fetch("/api/admin/merchants", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: m.id }),
    });
    if (!res.ok) setError("Couldn't delete that business.");
    await load();
  }

  async function deleteCustomer(c: AdminCustomer) {
    if (
      !window.confirm(
        `Delete customer ${c.email} permanently? Their points and codes at every business go with them.`
      )
    ) {
      return;
    }
    const res = await fetch("/api/admin/customers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id }),
    });
    if (!res.ok) setError("Couldn't delete that customer.");
    await load();
  }

  if (authorized === null) {
    return (
      <main className="flex min-h-screen items-center justify-center text-zinc-400">
        <span className="animate-pulse">Loading admin…</span>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <form
          className="card animate-fade-up w-full max-w-sm p-6 sm:p-8"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoggingIn(true);
            setLoginError(null);
            const res = await fetch("/api/admin/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: loginEmail, password: loginPassword }),
            });
            setLoggingIn(false);
            if (!res.ok) {
              setLoginError(
                res.status === 503
                  ? "Admin login isn't configured — set ADMIN_EMAIL and ADMIN_PASSWORD in your Vercel environment variables."
                  : "Wrong email or password."
              );
              return;
            }
            setLoginPassword("");
            await load();
          }}
        >
          <div className="flex items-center gap-2 text-lg font-bold tracking-tight text-zinc-900">
            <Shield className="size-5 text-emerald-600" aria-hidden />
            Admin login
          </div>
          <p className="mt-2 text-sm text-zinc-500">
            Sign in with the admin email and password from your Vercel
            environment variables.
          </p>
          <label className="mt-5 block">
            <span className="field-label">Admin email</span>
            <input
              type="email"
              required
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder="admin@spendbox.site"
              className="input-field"
            />
          </label>
          <label className="mt-4 block">
            <span className="field-label">Password</span>
            <PasswordInput
              required
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>
          {loginError && <p className="alert-error mt-4">{loginError}</p>}
          <button type="submit" disabled={loggingIn} className="btn-primary mt-6 w-full">
            {loggingIn ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4 pb-16 sm:p-8">
      <div className="animate-fade-up mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-zinc-900">
            <Shield className="size-6 text-emerald-600" aria-hidden />
            Spendbox admin
          </h1>
          <button
            onClick={async () => {
              await fetch("/api/admin/login", { method: "DELETE" });
              setAuthorized(false);
            }}
            className="btn-ghost"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </div>

        {error && <p className="alert-error mt-4">{error}</p>}

        <form onSubmit={savePrice} className="card mt-6 p-4 sm:p-5">
          <h2 className="section-title">
            <Landmark className="size-3.5" aria-hidden />
            Pricing & tap allowances
          </h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Premium price / year (₦)</span>
              <input
                type="number"
                min={100}
                step="any"
                onFocus={(e) => e.currentTarget.select()}
                value={priceNaira}
                onChange={(e) => setPriceNaira(e.target.value)}
                className="input-field w-full"
                aria-label="Premium price in naira"
              />
            </label>
            <label className="block">
              <span className="field-label">Top-up price / 1,000 taps (₦)</span>
              <input
                type="number"
                min={10}
                step="any"
                onFocus={(e) => e.currentTarget.select()}
                value={topupPriceNaira}
                onChange={(e) => setTopupPriceNaira(e.target.value)}
                className="input-field w-full"
                aria-label="Top-up price per 1000 taps in naira"
              />
            </label>
            <label className="block">
              <span className="field-label">Free taps / year</span>
              <input
                type="number"
                min={0}
                step="any"
                onFocus={(e) => e.currentTarget.select()}
                value={freePlays}
                onChange={(e) => setFreePlays(e.target.value)}
                className="input-field w-full"
                aria-label="Free tier yearly taps"
              />
            </label>
            <label className="block">
              <span className="field-label">Premium taps / year</span>
              <input
                type="number"
                min={0}
                step="any"
                onFocus={(e) => e.currentTarget.select()}
                value={premiumPlays}
                onChange={(e) => setPremiumPlays(e.target.value)}
                className="input-field w-full"
                aria-label="Premium tier yearly taps"
              />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button type="submit" className="btn-primary px-4 py-2">
              {savedPrice ? (
                <>
                  <Check className="size-4" aria-hidden /> Saved
                </>
              ) : (
                "Save settings"
              )}
            </button>
            <p className="text-xs text-zinc-400">
              A tap is one tile. Premium is a yearly Paystack plan; top-ups
              are one-off and never expire.
            </p>
          </div>
        </form>

        <form onSubmit={uploadImage} className="card mt-4 p-4 sm:p-5">
          <h2 className="section-title">
            <Upload className="size-3.5" aria-hidden />
            Add a free grid image
          </h2>
          <p className="mt-1.5 text-xs text-zinc-500">
            Free-tier businesses pick from this library for their puzzle grids.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex size-20 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-zinc-300 text-zinc-400 transition hover:border-emerald-500 hover:text-emerald-600"
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                <img src={preview} alt="Preview" className="size-full object-cover" />
              ) : (
                <ImagePlus className="size-6" aria-hidden />
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setPreview(URL.createObjectURL(f));
              }}
            />
            <label className="block grow">
              <span className="field-label">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                placeholder="Golden treasure map"
                className="input-field"
              />
            </label>
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? "Uploading…" : "Upload"}
            </button>
          </div>
        </form>

        <section className="card mt-4 p-4 sm:p-5">
          <h2 className="section-title">Library ({images.length})</h2>
          {images.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">No images yet.</p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {images.map((img) => (
                <li key={img.id} className="rounded-xl border border-zinc-200 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- storage host not known at build time */}
                  <img
                    src={img.url}
                    alt={img.title}
                    className={
                      "aspect-square w-full rounded-lg object-cover " +
                      (img.is_active ? "" : "opacity-40 grayscale")
                    }
                  />
                  <p className="mt-1.5 truncate text-xs font-medium text-zinc-700">
                    {img.title}
                  </p>
                  <div className="mt-1 flex gap-1">
                    <button
                      onClick={() => toggleImage(img)}
                      className="btn-ghost grow justify-center text-xs"
                    >
                      {img.is_active ? (
                        <>
                          <EyeOff className="size-3.5" aria-hidden /> Hide
                        </>
                      ) : (
                        <>
                          <Eye className="size-3.5" aria-hidden /> Show
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => deleteImage(img)}
                      className="btn-ghost justify-center text-xs text-rose-600 hover:bg-rose-50"
                      aria-label={`Delete ${img.title}`}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card mt-4 p-4 sm:p-5">
          <h2 className="section-title">
            <Store className="size-3.5" aria-hidden />
            Businesses ({merchants.length})
          </h2>
          {merchants.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">No businesses yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {merchants.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-zinc-200 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-zinc-900">
                      {m.businessName}
                      {m.tier === "premium" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          <Crown className="size-3" aria-hidden /> Premium
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      /g/{m.slug} · {m.customers} customer
                      {m.customers === 1 ? "" : "s"} · {m.activeGrids} active
                      grid{m.activeGrids === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/g/${m.slug}`}
                      target="_blank"
                      className="btn-secondary px-3 py-1.5 text-xs"
                    >
                      <ExternalLink className="size-3.5" aria-hidden />
                      View page
                    </Link>
                    <button
                      onClick={() => deleteMerchant(m)}
                      className="btn-secondary px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card mt-4 p-4 sm:p-5">
          <h2 className="section-title">
            <Users className="size-3.5" aria-hidden />
            Customers ({customers.length})
          </h2>
          {customers.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">No customers yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {customers.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-zinc-200 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium text-zinc-900">
                      {c.email}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {c.businesses} business{c.businesses === 1 ? "" : "es"} ·{" "}
                      {c.plays} tap{c.plays === 1 ? "" : "s"} · {c.points}{" "}
                      point{c.points === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteCustomer(c)}
                    className="btn-secondary px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
