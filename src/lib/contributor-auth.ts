import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { playerEmail } from "@/lib/player-session";
import { ensurePlayer } from "@/lib/game/boxes";

export interface ContributorRow {
  id: string;
  owner_id: string | null;
  player_id: string | null;
  display_name: string;
  handle: string;
  payout_bank_code: string | null;
  payout_bank_name: string | null;
  payout_account_number: string | null;
  payout_account_name: string | null;
  paystack_subaccount_code: string | null;
}

export const CONTRIBUTOR_COLUMNS =
  "id, owner_id, player_id, display_name, handle, payout_bank_code, payout_bank_name, payout_account_number, payout_account_name, paystack_subaccount_code";

/**
 * The signed-in creator behind an `/api/contributor/*` request.
 *
 * There used to be two ways to be a person here: a player (an address, a life
 * pool, a signed cookie) and a contributor (a Supabase auth user with an
 * entirely separate password). Same human, same inbox, two sign-ins, and no
 * way to get from one to the other. Creating a box and playing one are the
 * same account now.
 *
 * Identity resolves in two passes, and the order matters:
 *
 *   1. **The player session**, which is what everybody has. Their contributor
 *      row is found by `player_id`, or adopted by matching an older row whose
 *      auth user has the same address — that's the migration path, and it
 *      happens on first sight rather than as a step anybody performs.
 *   2. **The Supabase session**, for a creator who signed up before any of
 *      this and hasn't played. It keeps their dashboard working.
 *
 * `userId` is the *identity* rather than a Supabase user id: it comes back
 * non-null whenever somebody is signed in at all, including before they have
 * chosen a display name, because "signed in with no contributor row" is a real
 * state the dashboard has to render.
 */
export async function getAuthedContributor(): Promise<{
  userId: string | null;
  email: string | null;
  playerId: string | null;
  contributor: ContributorRow | null;
}> {
  const db = supabaseAdmin();

  // ---- 1. The player session ----------------------------------------------
  const email = await playerEmail();
  if (email) {
    const player = await ensurePlayer(db, email);
    if (player) {
      const { data } = await db
        .from("contributors")
        .select(CONTRIBUTOR_COLUMNS)
        .eq("player_id", player.id)
        .maybeSingle();
      if (data) {
        return {
          userId: player.id,
          email,
          playerId: player.id,
          contributor: data as ContributorRow,
        };
      }

      // No row against the player — but there may be an older one against an
      // auth user with the same address. Claim it once and it follows them.
      const adopted = await adoptLegacyContributor(db, player.id, email);
      return { userId: player.id, email, playerId: player.id, contributor: adopted };
    }
  }

  // ---- 2. The Supabase session --------------------------------------------
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, email: null, playerId: null, contributor: null };

  const { data } = await db
    .from("contributors")
    .select(CONTRIBUTOR_COLUMNS)
    .eq("owner_id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? null,
    playerId: null,
    contributor: (data as ContributorRow | null) ?? null,
  };
}

type Db = ReturnType<typeof supabaseAdmin>;

/**
 * Attach a pre-unification contributor row to the player with the same address.
 *
 * Only ever fills a `player_id` that is null, so a row already claimed stays
 * claimed — and the address match goes through `auth.users`, which is the only
 * place the old identity's email lives.
 */
async function adoptLegacyContributor(
  db: Db,
  playerId: string,
  email: string
): Promise<ContributorRow | null> {
  const { data: authUserId } = await db.rpc("auth_user_id_by_email", {
    p_email: email,
  });
  if (!authUserId) return null;

  const { data } = await db
    .from("contributors")
    .update({ player_id: playerId })
    .eq("owner_id", authUserId as string)
    .is("player_id", null)
    .select(CONTRIBUTOR_COLUMNS)
    .maybeSingle();

  return (data as ContributorRow | null) ?? null;
}
