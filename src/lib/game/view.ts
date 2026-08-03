// Assembling what the play screen sees.
//
// Every route that changes a hunt — guessing, buying a power-up — answers with
// a whole fresh `PlayView` rather than a patch. It costs a couple of extra
// queries and it means the screen can never drift out of step with the server
// about how many lives are left or which characters are dead.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { offerings, parseRevealed } from "@/lib/game/power-ups";
import {
  ensurePlayer,
  PUBLIC_BOX_COLUMNS,
  toPlayerState,
  toPublicBox,
  type BoxRow,
} from "@/lib/game/boxes";
import type { AttemptRecord, HuntState, PlayView } from "@/lib/types";
import type { LengthHint } from "@/lib/game/feedback";

type Db = ReturnType<typeof supabaseAdmin>;

/** How much of a long hunt is sent down. The rest stays in the database. */
const ATTEMPT_PAGE = 60;

export interface HuntRow {
  id: string;
  box_id: string;
  player_id: string;
  attempts_count: number;
  revealed: unknown;
  won_at: string | null;
}

export const HUNT_COLUMNS = "id, box_id, player_id, attempts_count, revealed, won_at";

/** The box behind a slug, or null. Never selects the password. */
export async function findBox(db: Db, slug: string): Promise<BoxRow | null> {
  const { data } = await db
    .from("boxes")
    .select(PUBLIC_BOX_COLUMNS)
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  return (data as BoxRow | null) ?? null;
}

export async function findHunt(
  db: Db,
  boxId: string,
  playerId: string
): Promise<HuntRow | null> {
  const { data } = await db
    .from("hunts")
    .select(HUNT_COLUMNS)
    .eq("box_id", boxId)
    .eq("player_id", playerId)
    .maybeSingle();
  return (data as HuntRow | null) ?? null;
}

interface AttemptDbRow {
  ordinal: number;
  value: string;
  length_hint: LengthHint;
  exact_count: number;
  miscase_count: number;
  created_at: string;
}

async function huntState(db: Db, hunt: HuntRow): Promise<HuntState> {
  const [{ data: attempts }, { data: orders }] = await Promise.all([
    db
      .from("attempts")
      .select("ordinal, value, length_hint, exact_count, miscase_count, created_at")
      .eq("hunt_id", hunt.id)
      .order("ordinal", { ascending: false })
      .limit(ATTEMPT_PAGE),
    db
      .from("power_up_orders")
      .select("note")
      .eq("hunt_id", hunt.id)
      .eq("status", "paid")
      .order("paid_at"),
  ]);

  const records: AttemptRecord[] = ((attempts ?? []) as AttemptDbRow[]).map((row) => ({
    ordinal: row.ordinal,
    value: row.value,
    lengthHint: row.length_hint,
    exact: row.exact_count,
    miscase: row.miscase_count,
    at: row.created_at,
  }));

  return {
    attemptsCount: hunt.attempts_count,
    attempts: records,
    revealed: parseRevealed(hunt.revealed),
    notes: ((orders ?? []) as { note: string | null }[])
      .map((o) => o.note)
      .filter((n): n is string => !!n),
    won: hunt.won_at !== null,
  };
}

/**
 * The whole play surface for one box and one (possibly anonymous) player.
 *
 * An unverified visitor still gets the box and the power-up prices — the game
 * should be legible before anyone is asked for an email address. What they
 * don't get is a hunt, because a guess costs a life and a life belongs to a
 * verified address.
 */
export async function buildPlayView(
  db: Db,
  box: BoxRow,
  email: string | null
): Promise<PlayView> {
  const contributor = box.contributor_id
    ? ((
        await db
          .from("contributors")
          .select("display_name")
          .eq("id", box.contributor_id)
          .maybeSingle()
      ).data?.display_name as string | undefined) ?? null
    : null;

  const winner = box.unlocked_by ? await winnerEmail(db, box.unlocked_by) : null;
  const publicBox = toPublicBox(box, { contributor, winnerEmail: winner });

  if (!email) {
    return {
      box: publicBox,
      player: toPlayerState(null, null),
      hunt: null,
      powerUps: offerings(parseRevealed(null)),
      claim: null,
    };
  }

  const playerRow = await ensurePlayer(db, email);
  const hunt = playerRow ? await findHunt(db, box.id, playerRow.id) : null;
  const state = hunt ? await huntState(db, hunt) : null;

  const { data: claim } = playerRow
    ? await db
        .from("reward_claims")
        .select("amount_kobo, status")
        .eq("box_id", box.id)
        .eq("player_id", playerRow.id)
        .maybeSingle()
    : { data: null };

  return {
    box: publicBox,
    player: toPlayerState(playerRow, email),
    hunt: state,
    powerUps: offerings(state?.revealed ?? parseRevealed(null)),
    claim: claim
      ? {
          amountKobo: Number(claim.amount_kobo),
          status: claim.status as "unclaimed" | "submitted" | "paid",
        }
      : null,
  };
}

/** The address behind a player id, for masking on public pages. */
export async function winnerEmail(db: Db, playerId: string): Promise<string | null> {
  const { data } = await db
    .from("players")
    .select("email")
    .eq("id", playerId)
    .maybeSingle();
  return (data?.email as string | undefined) ?? null;
}
