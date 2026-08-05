import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { alphabetOf, guessAlphabet, loadSymbols } from "@/lib/game/alphabet";

/**
 * Every character a password can be built from — and no authentication,
 * because this is deliberately public.
 *
 * The size of the search space is not a secret and was never meant to be one.
 * A player guessing blind is entitled to know what they are guessing *from*:
 * hiding the alphabet doesn't make a safe harder, it makes somebody spend a
 * life finding out whether `√` is allowed. Two lists come back because they
 * are not quite the same thing — `alphabet` is what a new password may
 * contain, `guess` also includes every symbol that used to be standard, so a
 * safe created under an older list stays typeable forever.
 */
export async function GET() {
  const symbols = await loadSymbols(supabaseAdmin());
  return NextResponse.json(
    {
      symbols,
      alphabet: alphabetOf(symbols),
      guess: guessAlphabet(symbols),
    },
    // Edited about once a year, read on every play screen. A minute of cache
    // keeps an admin's change visible while nobody waits on a round trip.
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" } }
  );
}
