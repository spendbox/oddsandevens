import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";
import { defaultPricing, loadPricing, sanitise } from "@/lib/game/pricing";
import { POWER_UP_KINDS, POWER_UPS } from "@/lib/game/power-ups";

/**
 * Prices, as an admin sees and sets them.
 *
 * The GET hands back three things at once — what the code defaults to, what
 * has been overridden, and the catalogue's names — because an editor that
 * shows a blank field can't tell you what blank *means*. Blank means "use the
 * default", and the default has to be on screen beside it for that to be a
 * usable answer.
 *
 * `defaults.funding` is the built-in contributor floor: the price of the
 * shortest password and what each character after it adds. It is the one price
 * here that nothing is charged against directly — it is a *minimum*, checked
 * when a box is created and never again, so changing it re-prices new boxes and
 * leaves every existing one exactly as it was.
 *
 * The PUT replaces the whole blob rather than merging, so clearing a field is
 * how a price goes back to its default. Everything is clamped by `sanitise`
 * before it is stored *and* again when it is read, so a bad number can neither
 * be saved nor honoured.
 */
export async function GET() {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  return NextResponse.json({
    overrides: await loadPricing(db),
    defaults: {
      ...defaultPricing(),
      powerUps: Object.fromEntries(
        POWER_UP_KINDS.map((kind) => [
          kind,
          {
            name: POWER_UPS[kind].name,
            share: POWER_UPS[kind].share,
            floorKobo: POWER_UPS[kind].floorKobo,
          },
        ])
      ),
    },
  });
}

export async function PUT(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const clean = sanitise(body);

  const { error } = await supabaseAdmin().rpc("set_pricing_settings", {
    p_value: clean,
    p_by: admin.email,
  });
  if (error) {
    console.error("[pricing] save failed:", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ overrides: clean });
}
