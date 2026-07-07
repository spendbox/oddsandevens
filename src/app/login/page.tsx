"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
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
            Merchant login
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Welcome back — your grid missed you.
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
              placeholder="••••••••"
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
          <button type="submit" disabled={busy} className="btn-primary mt-6 w-full">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="mt-5 text-center text-sm text-zinc-500">
            New here?{" "}
            <Link
              href="/signup"
              className="font-medium text-emerald-400 hover:text-emerald-300"
            >
              Create an account
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
