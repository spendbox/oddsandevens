import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { ensurePlayer, toPlayerState } from "@/lib/game/boxes";
import { liveLifeDiscount } from "@/lib/game/view";
import { loadPricing, resolved } from "@/lib/game/pricing";
import type { PlayerState } from "@/lib/types";

/**
 * Who the player is, resolved on the server.
 *
 * The provider used to start every page as an anonymous stranger and find out
 * otherwise a round trip later. On a fast connection that is a flash; on a
 * slow one it is a second of being told to sign in on a page you are already
 * signed into, and of a life count that says seven when it doesn't.
 *
 * The address is in a cookie the server can read, so there is no reason to ask
 * the browser to go and find out. Every page that mounts a `PlayerProvider`
 * resolves this first and hands it over as the starting state; the background
 * refresh still runs, but it now only ever *confirms* what was painted.
 *
 * The cost is that a page doing this can't be prerendered. That is the correct
 * trade for anything with a life count on it, which is all of them.
 */
export async function currentPlayerState(): Promise<PlayerState> {
  const email = await playerEmail();
  if (!email) return toPlayerState(null, null);

  const db = supabaseAdmin();
  // Reading is also what refills: `ensure_player` brings the hourly accrual up
  // to date, so a player who left the tab open overnight sees the right number
  // on the first paint rather than after the first fetch.
  const player = await ensurePlayer(db, email);
  const money = resolved(await loadPricing(db));
  return toPlayerState(player, email, {
    lifeDiscount: player ? await liveLifeDiscount(db, player.id) : null,
    lifePriceKobo: money.lifePriceKobo,
  });
}
