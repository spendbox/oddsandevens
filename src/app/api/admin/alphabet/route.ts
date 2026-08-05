import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";
import {
  alphabetOf,
  defaultSymbols,
  guessAlphabet,
  loadSymbols,
  sanitiseSymbols,
} from "@/lib/game/alphabet";

/**
 * The symbol list, as an admin sees and sets it.
 *
 * The GET hands back the live list and the built-in default together, because
 * "what happens if I empty this field" needs an answer on screen: it goes back
 * to the default, and the default has to be visible for that to be usable.
 *
 * The PUT replaces the list wholesale and sanitises it on the way in — the
 * same function the reader uses, so what is stored is exactly what will later
 * be honoured. Letters and digits are not settable and are not sent.
 */
export async function GET() {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const symbols = await loadSymbols(supabaseAdmin());
  return NextResponse.json({
    symbols,
    defaults: defaultSymbols(),
    alphabetSize: alphabetOf(symbols).length,
    guessSize: guessAlphabet(symbols).length,
  });
}

export async function PUT(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { symbols?: unknown };
  const symbols = sanitiseSymbols(body.symbols);

  const { error } = await supabaseAdmin().rpc("set_alphabet_settings", {
    p_value: { symbols },
    p_by: admin.email,
  });
  if (error) {
    console.error("[alphabet] save failed:", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  // What comes back is what was stored, which may be shorter than what was
  // sent — the editor shows the result rather than the request.
  const live = symbols.length > 0 ? symbols : defaultSymbols();
  return NextResponse.json({
    symbols: live,
    alphabetSize: alphabetOf(live).length,
    guessSize: guessAlphabet(live).length,
  });
}
