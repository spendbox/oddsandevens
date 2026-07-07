"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Puzzle } from "lucide-react";
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
          className="mb-6 flex items-center justify-center gap-2 text-lg font-bold tracking-tight text-zinc-900"
        >
          <Puzzle className="size-5 text-emerald-600" aria-hidden />
          Tile<span className="-ml-2 text-emerald-600">Hunt</span>
        </Link>
        <form onSubmit={onSubmit} className="card p-6 sm:p-8">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">
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
          {error && <p className="alert-error mt-4">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary mt-6 w-full">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="mt-5 text-center text-sm text-zinc-500">
            New here?{" "}
            <Link
              href="/signup"
              className="font-medium text-emerald-600 hover:text-emerald-500"
            >
              Create an account
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
