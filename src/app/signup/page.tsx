"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabaseBrowser().auth.signUp({
      email,
      password,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      router.push("/dashboard");
      router.refresh();
    } else {
      // Email confirmation is enabled on the Supabase project.
      setNeedsConfirm(true);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="animate-fade-up w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 block text-center text-lg font-bold tracking-tight text-white"
        >
          🧩 Tile<span className="text-emerald-400">Hunt</span>
        </Link>
        <form onSubmit={onSubmit} className="card p-6 sm:p-8">
          <h1 className="text-xl font-bold tracking-tight text-white">
            Create merchant account
          </h1>
          {needsConfirm ? (
            <p className="mt-5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-3 text-sm leading-relaxed text-emerald-300">
              📬 Check your inbox to confirm your email, then{" "}
              <Link href="/login" className="font-medium underline">
                sign in
              </Link>
              .
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-zinc-500">
                Free forever on the 5×5 grid. No card required.
              </p>
              <label className="mt-6 block">
                <span className="field-label">Email</span>
                <input
                  type="email"
                  required
                  placeholder="you@business.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                />
              </label>
              <label className="mt-4 block">
                <span className="field-label">Password</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                />
              </label>
              {error && (
                <p className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="btn-primary mt-6 w-full"
              >
                {busy ? "Creating…" : "Sign up"}
              </button>
              <p className="mt-5 text-center text-sm text-zinc-500">
                Already registered?{" "}
                <Link
                  href="/login"
                  className="font-medium text-emerald-400 hover:text-emerald-300"
                >
                  Sign in
                </Link>
              </p>
            </>
          )}
        </form>
      </div>
    </main>
  );
}
