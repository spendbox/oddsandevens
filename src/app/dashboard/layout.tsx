import { PlayerProvider } from "@/components/player/player-context";
import { currentPlayerState } from "@/lib/player-state";

/**
 * The dashboard runs on the player session now — one account for building a
 * box and for playing one — so it needs the same provider every other surface
 * has. It keeps its own header rather than the site one: this is a workbench,
 * and a life counter is not what you came here to look at.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <PlayerProvider initial={await currentPlayerState()}>{children}</PlayerProvider>;
}
