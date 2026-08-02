import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAuthedMerchant } from "@/lib/merchant-auth";
import {
  listBanks,
  paystackConfigured,
  resolveAccount,
  upsertSubaccount,
} from "@/lib/paystack";
import { DEFAULT_PLATFORM_SHARE_PERCENT } from "@/lib/constants";

// Where the business's share goes.
//
// Players buy extra plays; the business keeps most of it. Without a bank
// account on file that share would sit in our Paystack balance waiting for
// someone to move it by hand every week — so the business registers its
// account here, we create a Paystack subaccount for it, and every purchase is
// initialised against that subaccount. Paystack splits at settlement.
//
// No games can go live until this exists. `publish_game` enforces it; this
// route is the way to satisfy it.

/** Their current account, plus the bank list the form needs. */
export async function GET() {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }

  const db = supabaseAdmin();
  const [{ data: row }, { data: setting }] = await Promise.all([
    db
      .from("merchants")
      .select(
        "paystack_subaccount_code, payout_bank_code, payout_bank_name, payout_account_number, payout_account_name, payout_connected_at"
      )
      .eq("id", merchant.id)
      .maybeSingle(),
    db
      .from("app_settings")
      .select("value")
      .eq("key", "platform_revenue_share_percent")
      .maybeSingle(),
  ]);

  const platformShare = Number(setting?.value ?? DEFAULT_PLATFORM_SHARE_PERCENT);
  const banks = paystackConfigured() ? await listBanks() : [];

  return NextResponse.json({
    connected: Boolean(row?.paystack_subaccount_code),
    bankCode: row?.payout_bank_code ?? null,
    bankName: row?.payout_bank_name ?? null,
    // Only the tail. The business knows their own number; showing all of it
    // on a screen someone might be standing behind buys nothing.
    accountNumberLast4: row?.payout_account_number
      ? String(row.payout_account_number).slice(-4)
      : null,
    accountName: row?.payout_account_name ?? null,
    connectedAt: row?.payout_connected_at ?? null,
    yourSharePercent: 100 - platformShare,
    paymentsEnabled: paystackConfigured(),
    banks: banks ?? [],
  });
}

/**
 * Two jobs behind one route, told apart by `action`:
 *   resolve — whose account is this? (before committing to anything)
 *   connect — register it with Paystack and save it
 */
export async function POST(req: Request) {
  const { userId, merchant } = await getAuthedMerchant();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!merchant) {
    return NextResponse.json({ error: "no_merchant_profile" }, { status: 404 });
  }
  if (!paystackConfigured()) {
    return NextResponse.json(
      { error: "payments_not_configured" },
      { status: 503 }
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(body?.action ?? "connect");
  const bankCode = String(body?.bankCode ?? "").trim();
  const accountNumber = String(body?.accountNumber ?? "").trim();

  if (!/^\d{3,10}$/.test(bankCode)) {
    return NextResponse.json({ error: "invalid_bank" }, { status: 400 });
  }
  // Nigerian NUBAN is ten digits. Anything else is a typo, not a bank account.
  if (!/^\d{10}$/.test(accountNumber)) {
    return NextResponse.json({ error: "invalid_account_number" }, { status: 400 });
  }

  const resolved = await resolveAccount({ accountNumber, bankCode });
  if (!resolved) {
    return NextResponse.json({ error: "account_not_found" }, { status: 400 });
  }

  if (action === "resolve") {
    return NextResponse.json({ accountName: resolved.accountName });
  }

  const db = supabaseAdmin();
  const [{ data: current }, { data: setting }] = await Promise.all([
    db
      .from("merchants")
      .select("paystack_subaccount_code")
      .eq("id", merchant.id)
      .maybeSingle(),
    db
      .from("app_settings")
      .select("value")
      .eq("key", "platform_revenue_share_percent")
      .maybeSingle(),
  ]);

  const platformShare = Number(setting?.value ?? DEFAULT_PLATFORM_SHARE_PERCENT);
  const created = await upsertSubaccount({
    existingCode: current?.paystack_subaccount_code ?? null,
    businessName: merchant.business_name,
    bankCode,
    accountNumber,
    // Paystack's percentage_charge is what the subaccount *keeps*.
    percentageCharge: 100 - platformShare,
  });
  if (!created) {
    return NextResponse.json({ error: "subaccount_failed" }, { status: 502 });
  }

  const banks = await listBanks();
  const bankName = (banks ?? []).find((b) => b.code === bankCode)?.name ?? null;

  const { error } = await db
    .from("merchants")
    .update({
      paystack_subaccount_code: created.subaccountCode,
      payout_bank_code: bankCode,
      payout_bank_name: bankName,
      payout_account_number: accountNumber,
      payout_account_name: resolved.accountName,
      payout_connected_at: new Date().toISOString(),
    })
    .eq("id", merchant.id);
  if (error) {
    console.error("[payout] save failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  return NextResponse.json({
    connected: true,
    accountName: resolved.accountName,
    bankName,
    accountNumberLast4: accountNumber.slice(-4),
    yourSharePercent: 100 - platformShare,
  });
}
