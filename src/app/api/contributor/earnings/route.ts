import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PLATFORM_SHARE_PERCENT } from "@/lib/constants";
import { getAuthedContributor } from "@/lib/contributor-auth";
import { maskEmail } from "@/lib/mask";
import type { ContributorEarnings, WinnerRow } from "@/lib/types";

interface WinnerJoin {
  title: string;
  slug: string;
  reward_kobo: number;
  unlocked_at: string;
  players: { email: string } | null;
  reward_claims: { status: string }[] | null;
}

interface PaidOrder {
  contributor_kobo: number;
  platform_kobo: number;
  paid_at: string | null;
  quantity?: number;
}

/**
 * What the contributor has made, and who has beaten them.
 *
 * Two streams, both 70/30. **Power-ups**, bought by somebody attacking one of
 * their boxes, and **lives**, bought while doing it — a life is nominally not
 * attached to any box, but the decision to buy one always is, so it pays the
 * contributor whose safe was on screen. Funding isn't income: it's the reward,
 * already paid out or waiting to be.
 */
export async function GET() {
  const { userId, contributor } = await getAuthedContributor();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const empty: ContributorEarnings = {
    totalKobo: 0,
    last30dKobo: 0,
    powerUpsSold: 0,
    powerUpKobo: 0,
    lifeKobo: 0,
    livesSold: 0,
    platformKobo: 0,
    sharePercent: 100 - PLATFORM_SHARE_PERCENT,
    paidKobo: 0,
    owedKobo: 0,
  };
  if (!contributor) {
    return NextResponse.json({ earnings: empty, winners: [], payouts: [] });
  }

  const db = supabaseAdmin();
  const [{ data: orders }, { data: lifeOrders }, { data: unlocked }] = await Promise.all([
    db
      .from("power_up_orders")
      .select("contributor_kobo, platform_kobo, paid_at")
      .eq("contributor_id", contributor.id)
      .eq("status", "paid"),
    db
      .from("life_orders")
      .select("contributor_kobo, platform_kobo, quantity, paid_at")
      .eq("contributor_id", contributor.id)
      .eq("status", "paid"),
    db
      .from("boxes")
      .select("title, slug, reward_kobo, unlocked_at, players(email), reward_claims(status)")
      .eq("contributor_id", contributor.id)
      .eq("status", "unlocked")
      .order("unlocked_at", { ascending: false }),
  ]);

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const earnings = { ...empty };

  const fold = (rows: PaidOrder[], onRow: (row: PaidOrder, kobo: number) => void) => {
    for (const row of rows) {
      const kobo = Number(row.contributor_kobo);
      earnings.totalKobo += kobo;
      earnings.platformKobo += Number(row.platform_kobo);
      if (row.paid_at && new Date(row.paid_at).getTime() >= cutoff) {
        earnings.last30dKobo += kobo;
      }
      onRow(row, kobo);
    }
  };

  fold((orders ?? []) as PaidOrder[], (_row, kobo) => {
    earnings.powerUpKobo += kobo;
    earnings.powerUpsSold += 1;
  });
  fold((lifeOrders ?? []) as PaidOrder[], (row, kobo) => {
    earnings.lifeKobo += kobo;
    earnings.livesSold += Number(row.quantity ?? 0);
  });

  const winners: WinnerRow[] = ((unlocked ?? []) as unknown as WinnerJoin[]).map((box) => ({
    player: box.players?.email ? maskEmail(box.players.email) : "a player",
    boxTitle: box.title,
    boxSlug: box.slug,
    rewardKobo: Number(box.reward_kobo),
    unlockedAt: box.unlocked_at,
    claimStatus: (box.reward_claims?.[0]?.status ?? "unclaimed") as WinnerRow["claimStatus"],
  }));

  /*
   * What has actually been sent.
   *
   * Payouts are made by hand — weekly, by an admin working through a ledger —
   * so "earned" and "received" are two different numbers and a dashboard that
   * shows only the first is a dashboard that invites the email asking where
   * the money is. Both are here, with the transfers behind them.
   */
  const { data: sent } = await db
    .from("contributor_payouts")
    .select("id, amount_kobo, paid_at, note")
    .eq("contributor_id", contributor.id)
    .order("paid_at", { ascending: false })
    .limit(50);

  const payouts = ((sent ?? []) as {
    id: string;
    amount_kobo: number;
    paid_at: string;
    note: string | null;
  }[]).map((row) => ({
    id: row.id,
    amountKobo: Number(row.amount_kobo),
    paidAt: row.paid_at,
    note: row.note,
  }));

  earnings.paidKobo = payouts.reduce((total, p) => total + p.amountKobo, 0);
  earnings.owedKobo = Math.max(0, earnings.totalKobo - earnings.paidKobo);

  return NextResponse.json({ earnings, winners, payouts });
}
