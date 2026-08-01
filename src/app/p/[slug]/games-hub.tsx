"use client";

// One link that shows everything a business has running.

import { useEffect, useState } from "react";
import Link from "next/link";
import { GameIcon } from "@/components/games/icons";
import { gameDef, themeAccent } from "@/lib/games/catalog";
import type { PublicGamesHub } from "@/lib/games/types";

export default function GamesHub({ slug }: { slug: string }) {
  const [hub, setHub] = useState<PublicGamesHub | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let ignore = false;
    fetch(`/api/play/${encodeURIComponent(slug)}/games`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (ignore) return;
        if (!body) setNotFound(true);
        else setHub(body as PublicGamesHub);
      });
    return () => {
      ignore = true;
    };
  }, [slug]);

  if (notFound) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-center text-zinc-500">
        We couldn&apos;t find that business.
      </main>
    );
  }

  if (!hub) {
    return (
      <main className="flex min-h-screen items-center justify-center text-zinc-400">
        <span className="animate-pulse">Loading…</span>
      </main>
    );
  }

  const brand = hub.host.brandColor || "#059669";

  return (
    <main
      className="min-h-screen bg-zinc-50 p-4 pb-16 sm:p-6"
      style={{ "--brand": brand } as React.CSSProperties}
    >
      <div className="mx-auto flex max-w-lg flex-col gap-5">
        <header className="flex flex-col items-center gap-3 pt-6 text-center">
          {hub.host.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hub.host.logoUrl}
              alt=""
              className="size-16 rounded-2xl object-cover shadow-sm"
            />
          ) : (
            <span
              className="flex size-16 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-sm"
              style={{ backgroundColor: brand }}
            >
              {hub.host.businessName.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">
              {hub.host.businessName}
            </h1>
            {hub.host.tagline && (
              <p className="mt-0.5 text-sm text-zinc-500">{hub.host.tagline}</p>
            )}
          </div>
        </header>

        {hub.games.length === 0 ? (
          <p className="card p-6 text-center text-sm text-zinc-500">
            No games are running right now — check back soon.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {hub.games.map((game) => {
              const def = gameDef(game.type);
              const accent = themeAccent(game.theme, brand);
              return (
                <Link
                  key={game.slug}
                  href={`/p/${slug}/${game.slug}`}
                  className="card group flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span
                    className="flex size-12 shrink-0 items-center justify-center rounded-xl text-white"
                    style={{
                      background: def
                        ? `linear-gradient(140deg, ${def.swatch[0]}, ${def.swatch[1]})`
                        : accent,
                    }}
                  >
                    <GameIcon icon={def?.icon ?? "gamepad-2"} className="size-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-zinc-900">
                      {game.title}
                    </span>
                    <span className="block truncate text-sm text-zinc-500">
                      {game.description || def?.tagline || "Tap to play"}
                    </span>
                    {game.prizeTeasers.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {game.prizeTeasers.map((teaser, i) => (
                          <span
                            key={i}
                            className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600"
                          >
                            {teaser}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <span
                    className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: accent }}
                  >
                    Play
                  </span>
                </Link>
              );
            })}

          </div>
        )}

        <Link
          href="/me"
          className="text-center text-xs text-zinc-400 hover:text-zinc-600"
        >
          See everything you&apos;ve won
        </Link>
      </div>
    </main>
  );
}
