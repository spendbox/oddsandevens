// Assembling what the play screen sees.
//
// Every route that changes a run — starting one, guessing, buying a power-up —
// answers with a whole fresh `PlayView` rather than a patch. It costs a couple
// of extra queries and it means the screen can never drift out of step with
// the server about how many guesses are left or which characters are dead.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { offerings, parseRevealed, type Revealed } from "@/lib/game/power-ups";
import {
  ensurePlayer,
  PUBLIC_BOX_COLUMNS,
  toPlayerState,
  toPublicBox,
  type BoxRow,
} from "@/lib/game/boxes";
import type { PlayView, RunState } from "@/lib/types";

type Db = ReturnType<typeof supabaseAdmin>;

export interface RunRow {
  id: string;
  box_id: string;
  player_id: string;
  status: "active" | "won" | "lost";
  guesses_allowed: number;
  guesses_used: number;
  revealed: unknown;
}

export const RUN_COLUMNS =
  "id, box_id, player_id, status, guesses_allowed, guesses_used, revealed";

/** Total guesses this run may make, Second Wind included. */
export function guessBudget(run: { guesses_allowed: number }, revealed: Revealed): number {
  return run.guesses_allowed + revealed.bonusGuesses;
}

/** The box behind a slug, or null. Never selects the password. */
export async function findBox(db: Db, slug: string): Promise<BoxRow | null> {
  const { data } = await db
    .from("boxes")
    .select(PUBLIC_BOX_COLUMNS)
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  return (data as BoxRow | null) ?? null;
}

/**
 * The player's most recent run on this box: the active one if there is one,
 * otherwise the last finished one, so a screen reloaded after a loss still
 * shows the guesses that led there.
 */
async function latestRun(db: Db, boxId: string, playerId: string): Promise<RunRow | null> {
  const { data } = await db
    .from("runs")
    .select(RUN_COLUMNS)
    .eq("box_id", boxId)
    .eq("player_id", playerId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as RunRow | null) ?? null;
}

async function runState(db: Db, run: RunRow): Promise<RunState> {
  const [{ data: guesses }, { data: orders }] = await Promise.all([
    db.from("guesses").select("value, feedback").eq("run_id", run.id).order("ordinal"),
    db
      .from("power_up_orders")
      .select("note")
      .eq("run_id", run.id)
      .eq("status", "paid")
      .order("paid_at"),
  ]);

  const revealed = parseRevealed(run.revealed);
  return {
    runId: run.id,
    status: run.status,
    guessesAllowed: guessBudget(run, revealed),
    guessesUsed: run.guesses_used,
    guesses: (guesses ?? []) as { value: string; feedback: string }[],
    revealed,
    notes: ((orders ?? []) as { note: string | null }[])
      .map((o) => o.note)
      .filter((n): n is string => !!n),
  };
}

/**
 * The whole play surface for one box and one (possibly anonymous) player.
 *
 * An unverified visitor still gets the box and the power-up prices — the game
 * should be legible before anyone is asked for an email address. What they
 * don't get is a run, because a run costs a life and a life belongs to a
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
      run: null,
      powerUps: offerings(parseRevealed(null), box.length),
      prize: null,
    };
  }

  const playerRow = await ensurePlayer(db, email);

  const run = playerRow ? await latestRun(db, box.id, playerRow.id) : null;
  const state = run ? await runState(db, run) : null;

  const { data: claim } = playerRow
    ? await db
        .from("prize_claims")
        .select("amount_kobo, status")
        .eq("box_id", box.id)
        .eq("player_id", playerRow.id)
        .maybeSingle()
    : { data: null };

  return {
    box: publicBox,
    player: toPlayerState(playerRow, email),
    run: state,
    powerUps: offerings(state?.revealed ?? parseRevealed(null), box.length),
    prize: claim
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
