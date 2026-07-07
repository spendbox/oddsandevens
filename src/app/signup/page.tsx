"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Puzzle } from "lucide-react";
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
          className="mb-6 flex items-center justify-center gap-2 text-lg font-bold tracking-tight text-zinc-900"
        >
          <Puzzle className="size-5 text-emerald-600" aria-hidden />
          Tile<span className="-ml-2 text-emerald-600">Hunt</span>
        </Link>
        <form onSubmit={onSubmit} className="card p-6 sm:p-8">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">
            Create merchant account
          </h1>
          {needsConfirm ? (
            <p className="alert-success mt-5 leading-relaxed">
              Check your inbox to confirm your email, then{" "}
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
              {error && <p className="alert-error mt-4">{error}</p>}
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
                  className="font-medium text-emerald-600 hover:text-emerald-500"
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
