import { supabaseAdmin } from "@/lib/supabase/admin";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export const metadata = { title: "Unsubscribed — Spendbox" };
export const dynamic = "force-dynamic";

/**
 * One click, and it is done before this page renders.
 *
 * No login, no confirmation button, no "are you sure". A person who has
 * decided to stop hearing from us has already made the only decision this page
 * is about, and every step between them and it is a step towards them marking
 * the next message as spam instead — which costs the whole platform, because
 * the same domain carries the codes people log in with.
 *
 * It runs on GET, which mail clients and scanners will follow. That is the
 * right trade here: the worst a prefetch can do is stop marketing email to
 * somebody who was sent marketing email, and the link is in that email. It
 * touches nothing else — no lives, no safes, no rewards.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  let done = false;
  if (t) {
    const { data } = await supabaseAdmin().rpc("unsubscribe_by_token", { p_token: t });
    done = data === true;
  }

  return (
    <>
      <SiteHeader />
      <main className="flex-1 px-4 py-16">
        <div className="panel mx-auto max-w-md rounded-2xl p-6 text-center">
          <h1 className="text-2xl font-black tracking-tight">
            {done ? "Done — no more email." : "That link has expired."}
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            {done
              ? "We won’t email you again except when something you actually did needs it: a sign-in code, or a reward on its way to you."
              : "It may already have been used. If you’re still getting email you don’t want, reply to any of it and we'll take you off by hand."}
          </p>
          <p className="mt-4 text-sm text-zinc-500">
            Your lives, your safes and anything you’ve won are untouched.
          </p>
          <Link
            href="/"
            style={{ "--btn-lip": "var(--brass-deep)" } as React.CSSProperties}
            className="btn-chunky mt-6 inline-block rounded-2xl bg-brass px-6 py-3 text-ink"
          >
            Back to the safes
          </Link>
        </div>
      </main>
    </>
  );
}
