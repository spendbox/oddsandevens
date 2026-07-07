"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  ImagePlus,
  Landmark,
  LogOut,
  Shield,
  Upload,
} from "lucide-react";

interface AdminImage {
  id: string;
  title: string;
  url: string;
  is_active: boolean;
  created_at: string;
}

// Platform admin: curate the free grid-image library and set the premium
// price. Access is gated server-side by ADMIN_EMAILS — this page just renders
// whatever the /api/admin/* routes allow.
export default function AdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [images, setImages] = useState<AdminImage[]>([]);
  const [priceNaira, setPriceNaira] = useState("");
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
    { authorized: false } | { authorized: true; priceNaira: string; images: AdminImage[] }
  > => {
    const [settingsRes, imagesRes] = await Promise.all([
      fetch("/api/admin/settings"),
      fetch("/api/admin/images"),
    ]);
    if (settingsRes.status === 401 || imagesRes.status === 401) {
      return { authorized: false };
    }
    const settings = await settingsRes.json().catch(() => null);
    const imgs = await imagesRes.json().catch(() => null);
    return {
      authorized: true,
      priceNaira: String((settings?.premiumPriceKobo ?? 0) / 100),
      images: (imgs?.images as AdminImage[]) ?? [],
    };
  }, []);

  const applyAdminData = useCallback(
    (data: Awaited<ReturnType<typeof fetchAdminData>>) => {
      if (!data.authorized) {
        setAuthorized(false);
        return;
      }
      setPriceNaira(data.priceNaira);
      setImages(data.images);
      setAuthorized(true);
    },
    []
  );

  const load = useCallback(async () => {
    applyAdminData(await fetchAdminData());
  }, [fetchAdminData, applyAdminData]);

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
    const kobo = Math.round(Number(priceNaira) * 100);
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ premiumPriceKobo: kobo }),
    });
    if (!res.ok) {
      setError("Couldn't save the price — it must be between ₦100 and ₦1,000,000.");
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
              placeholder="admin@tilehunt.app"
              className="input-field"
            />
          </label>
          <label className="mt-4 block">
            <span className="field-label">Password</span>
            <input
              type="password"
              required
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="••••••••"
              className="input-field"
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
            TileHunt admin
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
            Premium price
          </h2>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-zinc-500">₦</span>
            <input
              type="number"
              min={100}
              step={100}
              value={priceNaira}
              onChange={(e) => setPriceNaira(e.target.value)}
              className="input-field w-40"
              aria-label="Premium price in naira"
            />
            <button type="submit" className="btn-primary px-4 py-2">
              {savedPrice ? (
                <>
                  <Check className="size-4" aria-hidden /> Saved
                </>
              ) : (
                "Save price"
              )}
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Charged once via Paystack when a business upgrades to Premium.
          </p>
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
                  <button
                    onClick={() => toggleImage(img)}
                    className="btn-ghost mt-1 w-full justify-center text-xs"
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
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
