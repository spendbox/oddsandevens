import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadHints } from "@/lib/game/hints";

/**
 * The strategy hints, and no authentication — deliberately.
 *
 * Nothing here is derived from any password: a hint is about the shape of the
 * problem, never about the safe in front of you. So the whole list can be
 * handed to every browser at once, which is also the only way to show a
 * different one each time the guess dialog opens without a round trip on every
 * single guess.
 */
export async function GET() {
  return NextResponse.json(
    { hints: await loadHints(supabaseAdmin()) },
    // Edited occasionally, read on every play screen.
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" } }
  );
}
