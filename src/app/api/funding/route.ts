import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadFundingLadder } from "@/lib/game/pricing";

/**
 * The least a contributor may put behind a box — and no authentication,
 * because a price list is not a secret.
 *
 * The ladder is a setting now rather than a constant, which means a browser
 * cannot import it: the Build screen quotes a floor for the length somebody
 * has just typed, prints the whole table underneath, and the landing page and
 * the explainer both name the cheapest box on the site. All of them would
 * otherwise be quoting last deploy's numbers at a contributor whose payment
 * the create route is about to refuse.
 *
 * Only the ladder comes back, not the whole pricing blob. What a power-up
 * costs is quoted per box by the play view and has nothing to do with this.
 */
export async function GET() {
  return NextResponse.json(
    { ladder: await loadFundingLadder(supabaseAdmin()) },
    // Changed about as often as the alphabet, read on every Build screen and
    // behind the explainer on the landing page. A minute of cache keeps an
    // admin's change visible while nobody waits on a round trip.
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" } }
  );
}
