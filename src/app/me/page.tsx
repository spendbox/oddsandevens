import { PlayerProvider } from "@/components/player/player-context";
import { currentPlayerState } from "@/lib/player-state";
import { SiteHeader } from "@/components/site-header";
import { PlayerPortal } from "@/components/player/player-portal";

export const metadata = { title: "Your lives and prizes — Spendbox" };

/**
 * A player's own page. Not an account — there's no password here and nothing
 * to manage. It's the two things a player might actually come back for: how
 * many lives they have, and where their prize money has got to.
 */
export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  const { reference } = await searchParams;
  return (
    <PlayerProvider initial={await currentPlayerState()}>
      <SiteHeader />
      <main className="flex-1">
        <PlayerPortal pendingReference={reference ?? null} />
      </main>
    </PlayerProvider>
  );
}
