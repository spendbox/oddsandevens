import PlayBoard from "./play-board";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PlayBoard slug={slug} />;
}
