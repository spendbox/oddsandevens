import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PLATFORM_SHARE_PERCENT } from "@/lib/constants";
import { getAuthedContributor } from "@/lib/contributor-auth";
import { maskEmail } from "@/lib/mask";
import type { ContributorEarnings, WinnerRow } from "@/lib/types";

interface WinnerJoin {
  title: string;
  slug: string;
  prize_kobo: number;
  unlocked_at: string;
  players: { email: string } | null;
  prize_claims: { status: string }[] | null;
}

/**
 * What the contributor has made, and who has beaten them.
 *
 * The income is entirely power-ups: a contributor's 70% of every one bought
 * while somebody was attacking one of their boxes. The stake isn't income —
 * it's the prize, already paid out or waiting to be.
 */
export async function GET() {
  const { userId, contributor } = await getAuthedContributor();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const empty: ContributorEarnings = {
    totalKobo: 0,
    last30dKobo: 0,
    powerUpsSold: 0,
    platformKobo: 0,
    sharePercent: 100 - PLATFORM_SHARE_PERCENT,
  };
  if (!contributor) return NextResponse.json({ earnings: empty, winners: [] });

  const db = supabaseAdmin();
  const [{ data: orders }, { data: unlocked }] = await Promise.all([
    db
      .from("power_up_orders")
      .select("contributor_kobo, platform_kobo, paid_at")
      .eq("contributor_id", contributor.id)
      .eq("status", "paid"),
    db
      .from("boxes")
      .select("title, slug, prize_kobo, unlocked_at, players(email), prize_claims(status)")
      .eq("contributor_id", contributor.id)
      .eq("status", "unlocked")
      .order("unlocked_at", { ascending: false }),
  ]);

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const earnings = ((orders ?? []) as {
    contributor_kobo: number;
    platform_kobo: number;
    paid_at: string | null;
  }[]).reduce<ContributorEarnings>((acc, order) => {
    const kobo = Number(order.contributor_kobo);
    acc.totalKobo += kobo;
    acc.platformKobo += Number(order.platform_kobo);
    acc.powerUpsSold += 1;
    if (order.paid_at && new Date(order.paid_at).getTime() >= cutoff) {
      acc.last30dKobo += kobo;
    }
    return acc;
  }, { ...empty });

  const winners: WinnerRow[] = ((unlocked ?? []) as unknown as WinnerJoin[]).map((box) => ({
    player: box.players?.email ? maskEmail(box.players.email) : "a player",
    boxTitle: box.title,
    boxSlug: box.slug,
    prizeKobo: Number(box.prize_kobo),
    unlockedAt: box.unlocked_at,
    claimStatus: (box.prize_claims?.[0]?.status ?? "unclaimed") as WinnerRow["claimStatus"],
  }));

  return NextResponse.json({ earnings, winners });
}
