import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ACCOUNT_NUMBER_REGEX } from "@/lib/constants";
import { playerEmail } from "@/lib/player-session";
import { ensurePlayer } from "@/lib/game/boxes";
import { listBanks, paystackConfigured, resolveAccount } from "@/lib/paystack";
import { sendAdminPayoutDueEmail } from "@/lib/email";
import { maskEmail } from "@/lib/mask";

/**
 * Where a player's rewards go.
 *
 * These used to be collected per claim, which meant winning twice meant typing
 * an account number twice with no way to fix the first. They live on the player
 * now; a claim still records what it was actually *paid to*, because that's a
 * payment record and must not move under an edit.
 */
export async function GET() {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });

  const player = await ensurePlayer(supabaseAdmin(), email);
  const { data } = await supabaseAdmin()
    .from("players")
    .select("bank_code, bank_name, account_number, account_name")
    .eq("id", player?.id ?? "")
    .maybeSingle();

  const row = (data ?? {}) as {
    bank_code?: string | null;
    bank_name?: string | null;
    account_number?: string | null;
    account_name?: string | null;
  };

  return NextResponse.json({
    bank: {
      bankCode: row.bank_code ?? null,
      bankName: row.bank_name ?? null,
      // Only the last four leave the server. There is nothing a player can do
      // on this screen that needs the whole number read back to them.
      accountLast4: row.account_number ? row.account_number.slice(-4) : null,
      accountName: row.account_name ?? null,
      connected: !!row.account_number,
    },
    banks: (await listBanks()) ?? [],
  });
}

export async function POST(req: Request) {
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });
  if (!paystackConfigured()) {
    return NextResponse.json({ error: "payments_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    bankCode?: string;
    bankName?: string;
    accountNumber?: string;
  };
  const bankCode = (body.bankCode ?? "").trim();
  const accountNumber = (body.accountNumber ?? "").trim();
  if (!bankCode || !ACCOUNT_NUMBER_REGEX.test(accountNumber)) {
    return NextResponse.json({ error: "invalid_account" }, { status: 400 });
  }

  // Checked against the bank before it's stored, so a mistyped digit is caught
  // while it's still a form rather than when a transfer bounces.
  const resolved = await resolveAccount({ accountNumber, bankCode });
  if (!resolved) {
    return NextResponse.json({ error: "account_not_found" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const player = await ensurePlayer(db, email);
  if (!player) return NextResponse.json({ error: "player_failed" }, { status: 500 });

  await db
    .from("players")
    .update({
      bank_code: bankCode,
      bank_name: body.bankName ?? null,
      account_number: accountNumber,
      account_name: resolved.accountName,
      bank_updated_at: new Date().toISOString(),
    })
    .eq("id", player.id);

  /*
   * An account arriving is the second half of a payable prize.
   *
   * A win with nowhere to send the money is not actionable, so nothing was
   * announced at the time. Now there is an account, every unpaid claim this
   * player holds is something an administrator can act on — and they are the
   * only thing that moves it, since transfers are made by hand.
   *
   * After the response is decided, and never awaited into the failure path: a
   * player saving their bank details must not be able to see an email problem.
   */
  const { data: due } = await db
    .from("reward_claims")
    .select("amount_kobo, boxes(title)")
    .eq("player_id", player.id)
    .neq("status", "paid");

  for (const claim of (due ?? []) as unknown as {
    amount_kobo: number;
    boxes: { title: string } | null;
  }[]) {
    await sendAdminPayoutDueEmail({
      kind: "prize",
      who: maskEmail(email),
      amountKobo: Number(claim.amount_kobo),
      title: claim.boxes?.title ?? null,
      accountName: resolved.accountName,
      bankName: body.bankName ?? null,
    });
  }

  return NextResponse.json({ result: "saved", accountName: resolved.accountName });
}
