import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export interface ContributorRow {
  id: string;
  owner_id: string;
  display_name: string;
  handle: string;
  payout_bank_code: string | null;
  payout_bank_name: string | null;
  payout_account_number: string | null;
  payout_account_name: string | null;
  paystack_subaccount_code: string | null;
}

export const CONTRIBUTOR_COLUMNS =
  "id, owner_id, display_name, handle, payout_bank_code, payout_bank_name, payout_account_number, payout_account_name, paystack_subaccount_code";

/**
 * The signed-in contributor behind an /api/contributor/* request.
 *
 * Identity comes from the Supabase session cookie; the row itself is read with
 * the service role because the route is about to act on it. A signed-in user
 * with no contributor row yet is a real state — they've confirmed their email
 * but haven't picked a name — so the userId comes back either way.
 */
export async function getAuthedContributor(): Promise<{
  userId: string | null;
  contributor: ContributorRow | null;
}> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, contributor: null };

  const { data } = await supabaseAdmin()
    .from("contributors")
    .select(CONTRIBUTOR_COLUMNS)
    .eq("owner_id", user.id)
    .maybeSingle();

  return { userId: user.id, contributor: (data as ContributorRow | null) ?? null };
}
