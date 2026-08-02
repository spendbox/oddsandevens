import GamesHub from "./games-hub";

// The business's game hub: one link that shows everything they have running.
export default async function HubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <GamesHub slug={slug} />;
}
