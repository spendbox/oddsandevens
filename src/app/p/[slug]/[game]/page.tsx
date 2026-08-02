import type { Metadata } from "next";
import GamePlayer from "./game-player";

// Shareable per-game link: /p/<business>/<game>. The page itself is a thin
// server shell — everything interactive lives in the client player.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; game: string }>;
}): Promise<Metadata> {
  const { slug, game } = await params;
  const title = `Play ${game.replace(/-/g, " ")} · ${slug}`;
  return {
    title,
    description: "Play, win, and claim your prize.",
    openGraph: { title, type: "website" },
  };
}

export default async function GamePage({
  params,
}: {
  params: Promise<{ slug: string; game: string }>;
}) {
  const { slug, game } = await params;
  return <GamePlayer slug={slug} gameSlug={game} />;
}
