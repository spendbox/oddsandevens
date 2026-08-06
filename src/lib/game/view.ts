// Assembling what the play screen sees.
//
// Every route that changes a hunt — guessing, buying a power-up — answers with
// a whole fresh `PlayView` rather than a patch. It costs a couple of extra
// queries and it means the screen can never drift out of step with the server
// about how many lives are left or which characters are dead.

import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  breakdownActive,
  offerings,
  parseRevealed,
  secondWindActive,
} from "@/lib/game/power-ups";
import {
  ensurePlayer,
  PUBLIC_BOX_COLUMNS,
  toPlayerState,
  toPublicBox,
  type BoxRow,
} from "@/lib/game/boxes";
import { maskEmail } from "@/lib/mask";
import { loadPricing, resolved } from "@/lib/game/pricing";
import type {
  AttemptRecord,
  ClaimedDiscount,
  Drop,
  HuntState,
  PlayView,
  Rival,
} from "@/lib/types";
import type { LengthHint } from "@/lib/game/feedback";

type Db = ReturnType<typeof supabaseAdmin>;

/** How much of a long hunt is sent down. The rest stays in the database. */
const ATTEMPT_PAGE = 60;

/** How many cars the chase draws. */
const RIVALS = 10;

export interface HuntRow {
  id: string;
  box_id: string;
  player_id: string;
  attempts_count: number;
  revealed: unknown;
  won_at: string | null;
  best_percent: string | number;
}

export const HUNT_COLUMNS =
  "id, box_id, player_id, attempts_count, revealed, won_at, best_percent";

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
  elsewhere_count: number;
  elsewhere_miscase_count: number;
  score_percent: string | number;
  created_at: string;
}

async function huntState(db: Db, hunt: HuntRow): Promise<HuntState> {
  const [{ data: attempts }, { data: orders }] = await Promise.all([
    db
      .from("attempts")
      .select(
        "ordinal, value, length_hint, exact_count, miscase_count, elsewhere_count, elsewhere_miscase_count, score_percent, created_at"
      )
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

  const revealed = parseRevealed(hunt.revealed);

  // The gate, and it is a clock rather than a flag. Component counts sit on
  // every row in the database and stay there unless Colour Read is *currently*
  // in force — a browser that hasn't paid, or whose 24 hours have run out,
  // never receives them, so there is nothing to un-hide in devtools and an
  // old page left open stops working on its own.
  const lens = breakdownActive(revealed);
  const records: AttemptRecord[] = ((attempts ?? []) as AttemptDbRow[]).map((row) => ({
    ordinal: row.ordinal,
    value: row.value,
    lengthHint: row.length_hint,
    scorePercent: Number(row.score_percent),
    breakdown: lens
      ? {
          exact: row.exact_count,
          miscase: row.miscase_count,
          elsewhere: row.elsewhere_count,
          elsewhereMiscase: row.elsewhere_miscase_count,
        }
      : null,
    at: row.created_at,
  }));

  return {
    attemptsCount: hunt.attempts_count,
    attempts: records,
    revealed,
    notes: ((orders ?? []) as { note: string | null }[])
      .map((o) => o.note)
      .filter((n): n is string => !!n),
    hasBreakdown: lens,
    breakdownUntil: lens ? revealed.breakdownUntil : null,
    secondWindUntil: secondWindActive(revealed) ? revealed.secondWindUntil : null,
    bestPercent: Number(hunt.best_percent ?? 0),
    won: hunt.won_at !== null,
  };
}

/**
 * The top ten hunters on a box, closest first.
 *
 * One query against `hunts.best_percent`, which 0034 added for exactly this —
 * the alternative is a sort over every guess ever made against a popular safe,
 * on every page load.
 *
 * Addresses are masked here, on the server, before they are in a payload. The
 * play screen shows them when you tap a car, and "a**@g***.com is 62% of the
 * way in" is the most a stranger should ever learn about another stranger.
 */
async function rivalsOn(db: Db, boxId: string, meId: string | null): Promise<Rival[]> {
  const [{ data }, { data: seeded }] = await Promise.all([
    db
      .from("hunts")
      .select("player_id, best_percent")
      .eq("box_id", boxId)
      .order("best_percent", { ascending: false })
      .limit(RIVALS),
    // The names an admin put on the board before anybody arrived. A separate
    // table rather than invented hunts, so no real query ever has to tell the
    // two apart — they meet here, on the way out, and nowhere else.
    db
      .from("box_seeds")
      .select("email, percent")
      .eq("box_id", boxId)
      .order("rank")
      .limit(RIVALS),
  ]);

  const rows = (data ?? []) as { player_id: string; best_percent: string | number }[];
  const emails = new Map<string, string>();

  if (rows.length > 0) {
    const { data: people } = await db
      .from("players")
      .select("id, email")
      .in("id", rows.map((r) => r.player_id));
    ((people ?? []) as { id: string; email: string }[]).forEach((p) =>
      emails.set(p.id, p.email)
    );
  }

  const real: Rival[] = rows.map((row) => ({
    player: maskEmail(emails.get(row.player_id) ?? ""),
    percent: Number(row.best_percent ?? 0),
    you: row.player_id === meId,
  }));

  const invented: Rival[] = ((seeded ?? []) as { email: string; percent: string | number }[]).map(
    (row) => ({
      player: maskEmail(row.email),
      percent: Number(row.percent ?? 0),
      you: false,
    })
  );

  // Sorted together and cut to the same ten, so a seeded name is overtaken by
  // a real player the moment one gets past it rather than holding a lane
  // forever. `you` never loses its place: if the merge would push somebody off
  // the end of their own leaderboard, their car has to stay.
  const merged = [...real, ...invented].sort((a, b) => b.percent - a.percent);
  const top = merged.slice(0, RIVALS);
  const me = merged.find((r) => r.you);
  if (me && !top.includes(me)) top[top.length - 1] = me;
  return top;
}

/** An unclaimed offer, if one is waiting. */
async function liveOffer(db: Db, playerId: string): Promise<Drop | null> {
  const { data } = await db
    .from("player_offers")
    .select("id, kind, amount, power_up, expires_at")
    .eq("player_id", playerId)
    .is("claimed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const row = data as {
    id: string;
    kind: Drop["kind"];
    amount: number;
    power_up: string | null;
    expires_at: string;
  };
  return {
    id: row.id,
    kind: row.kind,
    amount: row.amount,
    powerUp: row.power_up,
    expiresAt: row.expires_at,
  };
}

/**
 * A discount already claimed, still live, and not yet spent.
 *
 * The same row `discount_for` prices against at checkout, read here so the
 * screen can show what the player is holding and how long they have left with
 * it. Reading it rather than calling `discount_for` because the screen needs
 * the expiry and the power-up's name, and that function returns a number.
 */
async function liveDiscount(
  db: Db,
  playerId: string,
  boxId: string
): Promise<ClaimedDiscount | null> {
  const { data } = await db
    .from("player_offers")
    .select("amount, power_up, expires_at")
    .eq("player_id", playerId)
    .eq("kind", "power_up_discount")
    .not("claimed_at", "is", null)
    .is("spent_at", null)
    .or(`box_id.is.null,box_id.eq.${boxId}`)
    .gt("expires_at", new Date().toISOString())
    .order("amount", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as { amount: number; power_up: string | null; expires_at: string } | null;
  if (!row?.power_up) return null;
  return {
    powerUp: row.power_up,
    amount: Number(row.amount),
    expiresAt: row.expires_at,
  };
}

/**
 * Money off the next lives order, claimed and unspent.
 *
 * Read into `PlayerState` rather than into the play view, because the lives
 * dialog opens from three places — the game, the header and the profile — and
 * only one of those has a box in front of it.
 */
export async function liveLifeDiscount(
  db: Db,
  playerId: string
): Promise<{ amount: number; expiresAt: string } | null> {
  const { data } = await db
    .from("player_offers")
    .select("amount, expires_at")
    .eq("player_id", playerId)
    .eq("kind", "life_discount")
    .not("claimed_at", "is", null)
    .is("spent_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("amount", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as { amount: number; expires_at: string } | null;
  return row ? { amount: Number(row.amount), expiresAt: row.expires_at } : null;
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

  // A seeded winner is an address on the box itself, so there is nobody to
  // look up — `toPublicBox` prefers it and masks it the same way.
  const winner =
    !box.unlocked_alias && box.unlocked_by
      ? await winnerEmail(db, box.unlocked_by)
      : null;
  const publicBox = toPublicBox(box, { contributor, winnerEmail: winner });

  // Whatever an admin has changed. The shelf is quoted from it, and the
  // checkout re-reads it rather than trusting the quote.
  const prices = await loadPricing(db);
  const money = resolved(prices);

  if (!email) {
    return {
      box: publicBox,
      player: toPlayerState(null, null, { lifePriceKobo: money.lifePriceKobo }),
      hunt: null,
      rivals: await rivalsOn(db, box.id, null),
      offer: null,
      discount: null,
      lifeBankKobo: money.lifeBankKobo,
      powerUps: offerings(parseRevealed(null), box.reward_kobo, prices),
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
    player: toPlayerState(playerRow, email, {
      lifeDiscount: playerRow ? await liveLifeDiscount(db, playerRow.id) : null,
      lifePriceKobo: money.lifePriceKobo,
    }),
    hunt: state,
    rivals: await rivalsOn(db, box.id, playerRow?.id ?? null),
    offer: playerRow ? await liveOffer(db, playerRow.id) : null,
    discount: playerRow ? await liveDiscount(db, playerRow.id, box.id) : null,
    lifeBankKobo: money.lifeBankKobo,
    powerUps: offerings(state?.revealed ?? parseRevealed(null), box.reward_kobo, prices),
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
