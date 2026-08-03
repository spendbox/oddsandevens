import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { EMAIL_REGEX } from "@/lib/constants";
import { getAdminUser } from "@/lib/admin-auth";

const MAX_GRANT = 500;

/**
 * Give a player lives, free.
 *
 * For when something breaks on our side and the honest fix is to hand somebody
 * their afternoon back. The player doesn't have to exist yet — an address that
 * has never played gets a row and the lives waiting for it, which is what you
 * want when you're apologising to someone by email.
 *
 * Granted lives sit on top of the cap exactly like bought ones: the hourly
 * refill won't top a player up past seven, but nothing takes these away.
 */
export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    count?: number;
  };
  const email = (body.email ?? "").trim().toLowerCase();
  const count = Math.trunc(Number(body.count ?? 0));

  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (!Number.isFinite(count) || count < 1 || count > MAX_GRANT) {
    return NextResponse.json({ error: "invalid_count" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin().rpc("admin_grant_lives", {
    p_email: email,
    p_count: count,
  });
  if (error) {
    console.error("[admin] grant lives failed:", error);
    return NextResponse.json({ error: "grant_failed" }, { status: 500 });
  }

  const result = data as { result?: string; error?: string; lives?: number };
  if (result.result !== "granted") {
    return NextResponse.json({ error: result.error ?? "grant_failed" }, { status: 400 });
  }

  console.log(`[admin] ${admin.email} granted ${count} lives to ${email}`);
  return NextResponse.json({ result: "granted", email, lives: result.lives });
}

/** Who a player is, so an admin can check before handing out lives. */
export async function GET(req: Request) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const email = new URL(req.url).searchParams.get("email")?.trim().toLowerCase();
  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const { data } = await supabaseAdmin()
    .from("players")
    .select("email, lives, created_at")
    .eq("email", email)
    .maybeSingle();

  return NextResponse.json({
    player: data
      ? { email: data.email, lives: data.lives, since: data.created_at }
      : null,
  });
}
