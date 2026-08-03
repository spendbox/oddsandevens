import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ALPHABET_SET, MAX_GUESS_LENGTH } from "@/lib/constants";
import { playerEmail } from "@/lib/player-session";
import { isWellFormed, type LengthHint } from "@/lib/game/feedback";
import { buildPlayView, findBox } from "@/lib/game/view";
import { sendBoxCrackedEmail, sendBoxUnlockedEmail } from "@/lib/email";
import { maskEmail } from "@/lib/mask";

/**
 * One guess. One life.
 *
 * Nothing about the comparison happens here: `spend_attempt` takes the life,
 * scores the guess against the password, records the attempt and settles a win
 * in a single statement inside Postgres. The password is never read into this
 * process, and two requests can't both spend the last life.
 *
 * The guess is NOT length-checked. Not knowing how long the password is is the
 * first thing a player has to beat, and probing lengths is a legitimate — and
 * expensive — move.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { guess?: string };
  const guess = body.guess ?? "";

  if (!isWellFormed(guess, ALPHABET_SET, MAX_GUESS_LENGTH)) {
    return NextResponse.json({ error: "malformed_guess" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const box = await findBox(db, slug);
  if (!box) return NextResponse.json({ error: "box_not_found" }, { status: 404 });

  const { data, error } = await db.rpc("spend_attempt", {
    p_email: email,
    p_box_id: box.id,
    p_guess: guess,
  });
  if (error) {
    console.error("[attempt] spend_attempt failed:", error);
    return NextResponse.json({ error: "attempt_failed" }, { status: 500 });
  }

  const verdict = data as {
    result: string;
    error?: string;
    next_life_at?: string;
    length_hint?: LengthHint;
    exact?: number;
    miscase?: number;
    outcome?: string;
  };

  if (verdict.result === "error") {
    return NextResponse.json(
      { error: verdict.error, nextLifeAt: verdict.next_life_at ?? null },
      { status: verdict.error === "no_lives" ? 402 : 409 }
    );
  }

  const outcome = (verdict.outcome ?? "open") as "open" | "won" | "pipped";
  if (outcome === "won") {
    await announce(db, {
      email,
      slug: box.slug,
      title: box.title,
      rewardKobo: box.reward_kobo,
      contributorId: box.contributor_id,
    });
  }

  // Re-read the box: a win has just changed its status and unlocked_by.
  const settled = (await findBox(db, slug)) ?? box;
  return NextResponse.json({
    ...(await buildPlayView(db, settled, email)),
    outcome,
    verdict: {
      lengthHint: verdict.length_hint ?? "exact",
      exact: verdict.exact ?? 0,
      miscase: verdict.miscase ?? 0,
    },
  });
}

/** Tell the winner, and tell whoever's money it was. Never blocks the answer. */
async function announce(
  db: ReturnType<typeof supabaseAdmin>,
  params: {
    email: string;
    slug: string;
    title: string;
    rewardKobo: number;
    contributorId: string | null;
  }
) {
  await sendBoxUnlockedEmail({
    to: params.email,
    title: params.title,
    rewardKobo: params.rewardKobo,
  });
  if (!params.contributorId) return;

  const { data: owner } = await db
    .from("contributors")
    .select("owner_id")
    .eq("id", params.contributorId)
    .maybeSingle();
  if (!owner) return;

  const { data: user } = await db.auth.admin.getUserById(owner.owner_id as string);
  if (!user?.user?.email) return;

  await sendBoxCrackedEmail({
    to: user.user.email,
    title: params.title,
    player: maskEmail(params.email),
    rewardKobo: params.rewardKobo,
  });
}
