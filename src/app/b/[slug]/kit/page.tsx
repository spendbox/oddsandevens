import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Download } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { findBox } from "@/lib/game/view";
import { rewardLabel } from "@/lib/game/rewards";
import { toSponsor } from "@/lib/game/sponsors";
import { SHARE_FORMATS, SHARE_SPECS, shareFileName } from "@/lib/game/share-kit";
import { SponsorPrize } from "@/components/sponsor";

/**
 * A sponsor's share kit: the link, and the artwork.
 *
 * The page the email points at, and the reason the email is worth sending. A
 * business that has paid to be on a safe needs something to *post*, and "here
 * is your box, make your own graphic" is how a sponsorship quietly produces
 * nothing and doesn't get renewed.
 *
 * **Public, and deliberately so.** Everything here — the posters, the link, the
 * reward — is already on the box's own public page; there is nothing to protect
 * and a login would only stand between a marketing person and the file they
 * were emailed. The one thing that is private, the sponsor's address, is not on
 * this page and never leaves the server.
 *
 * It is `noindex` all the same. Not for secrecy: a kit page competing with the
 * box itself in search results would split the traffic the sponsor is paying
 * for across two pages, one of which cannot be played.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const box = await findBox(supabaseAdmin(), slug);
  return {
    title: box ? `Share kit — ${box.title}` : "Share kit",
    robots: { index: false, follow: false },
  };
}

export default async function KitPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const box = await findBox(supabaseAdmin(), slug);
  if (!box || box.status === "draft" || box.status === "funding") notFound();

  const sponsor = toSponsor(box);
  const challenge = Number(box.reward_kobo) <= 0;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <p className="text-[11px] font-black uppercase tracking-[0.25em] text-grape">
        {sponsor ? `For ${sponsor.name}` : "Share kit"}
      </p>
      <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
        Everything you need to share {box.title}
      </h1>
      <p className="mt-3 text-zinc-400">
        {challenge ? (
          <>A pure challenge — no money behind it, just the password.</>
        ) : (
          <>
            <strong className="text-brass">{rewardLabel(Number(box.reward_kobo))}</strong> sits
            behind a password. Anyone can play free: seven lives, one back every hour.
          </>
        )}
      </p>

      {/* The link first. It is the only thing on this page that is strictly
          required — the artwork exists to carry it. */}
      <section className="panel mt-8 rounded-3xl p-5">
        <h2 className="text-sm font-black uppercase tracking-wide text-zinc-300">
          Your link
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Send people here. It works on any phone, and nothing needs installing.
        </p>
        <Link
          href={`/b/${box.slug}`}
          className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-black/30 px-4 py-3.5 font-mono text-sm font-bold text-brass transition hover:bg-black/50"
        >
          <span className="truncate">/b/{box.slug}</span>
          <ArrowRight className="size-4 shrink-0" aria-hidden />
        </Link>
      </section>

      {sponsor?.prize && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-zinc-300">
            What the winner gets from you
          </h2>
          <SponsorPrize sponsor={sponsor} heading={`From ${sponsor.name}`} />
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-black uppercase tracking-wide text-zinc-300">
          Three designs
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Ready to post. Right-click or long-press to save, or use the download
          button — they are ordinary PNG files.
        </p>

        <div className="mt-4 space-y-4">
          {SHARE_FORMATS.map((format) => {
            const spec = SHARE_SPECS[format];
            const src = `/api/share/${box.slug}/${format}`;
            return (
              <div key={format} className="panel overflow-hidden rounded-3xl">
                {/*
                  A plain `img`, not `next/image`, and not a mistake. These are
                  generated PNGs at known sizes, served from our own origin with
                  an hour of cache on them — putting the optimiser in front would
                  re-encode a file whose whole purpose is to be downloaded
                  byte-for-byte and posted elsewhere.
                */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`${spec.label} design for ${box.title}`}
                  width={spec.width}
                  height={spec.height}
                  className="h-auto w-full bg-black/40"
                />
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="font-black tracking-tight">
                      {spec.label}{" "}
                      <span className="font-mono text-xs font-normal text-zinc-500">
                        {spec.width}×{spec.height}
                      </span>
                    </p>
                    <p className="text-xs text-zinc-500">{spec.usage}</p>
                  </div>
                  {/*
                    `download` with a filename, which is why this is an anchor
                    and not a button: it is the browser's own save, so it works
                    without JavaScript and keeps the name we chose rather than
                    saving as `wide`.
                  */}
                  <a
                    href={src}
                    download={shareFileName(box.slug, format)}
                    style={{ "--btn-lip": "var(--grape-deep)" } as React.CSSProperties}
                    className="btn-chunky inline-flex shrink-0 items-center gap-2 rounded-2xl bg-grape px-4 py-2.5 text-sm text-white"
                  >
                    <Download className="size-4" aria-hidden />
                    Download
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <p className="mt-8 text-sm text-zinc-500">
        The designs update themselves if the reward changes, so a link you sent
        last week still shows the right figure.
      </p>
    </main>
  );
}
