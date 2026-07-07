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
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl bg-zinc-900 p-6 shadow-xl ring-1 ring-zinc-800"
      >
        <h1 className="text-xl font-bold text-white">Create merchant account</h1>
        {needsConfirm ? (
          <p className="mt-4 text-sm text-emerald-300">
            Check your inbox to confirm your email, then{" "}
            <Link href="/login" className="underline">
              sign in
            </Link>
            .
          </p>
        ) : (
          <>
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-4 w-full rounded-lg bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 outline-none ring-1 ring-zinc-700 focus:ring-emerald-500"
            />
            <input
              type="password"
              required
              minLength={8}
              placeholder="Password (min 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-3 w-full rounded-lg bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 outline-none ring-1 ring-zinc-700 focus:ring-emerald-500"
            />
            {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="mt-4 w-full rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Sign up"}
            </button>
            <p className="mt-4 text-center text-sm text-zinc-400">
              Already registered?{" "}
              <Link href="/login" className="text-emerald-400 underline">
                Sign in
              </Link>
            </p>
          </>
        )}
      </form>
    </main>
  );
}
