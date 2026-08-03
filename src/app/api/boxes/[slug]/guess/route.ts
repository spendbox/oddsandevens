import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { playerEmail } from "@/lib/player-session";
import { isSolved, isWellFormed, scoreGuess } from "@/lib/game/feedback";
import { parseRevealed } from "@/lib/game/power-ups";
import { buildPlayView, findBox, guessBudget, RUN_COLUMNS, type RunRow } from "@/lib/game/view";
import { sendBoxCrackedEmail, sendBoxUnlockedEmail } from "@/lib/email";
import { maskEmail } from "@/lib/mask";

/**
 * Submit one guess.
 *
 * The password is read here, compared here, and dropped here. What goes back
 * is a string of `g`/`o`/`r` — the only thing about the password that ever
 * leaves the server.
 *
 * Two requests racing on the same run both compute the same ordinal, and the
 * unique index on `(run_id, ordinal)` lets exactly one of them through; the
 * loser is told to retry rather than being quietly charged a guess.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const email = await playerEmail();
  if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { guess?: string };
  const guess = (body.guess ?? "").trim().toUpperCase();

  const db = supabaseAdmin();
  const box = await findBox(db, slug);
  if (!box) return NextResponse.json({ error: "box_not_found" }, { status: 404 });
  if (!isWellFormed(guess, box.length)) {
    return NextResponse.json({ error: "malformed_guess" }, { status: 400 });
  }

  const { data: player } = await db
    .from("players")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!player) return NextResponse.json({ error: "no_run" }, { status: 409 });

  const { data: runData } = await db
    .from("runs")
    .select(RUN_COLUMNS)
    .eq("box_id", box.id)
    .eq("player_id", player.id)
    .eq("status", "active")
    .maybeSingle();
  const run = (runData as RunRow | null) ?? null;
  if (!run) return NextResponse.json({ error: "no_run" }, { status: 409 });

  const revealed = parseRevealed(run.revealed);
  const budget = guessBudget(run, revealed);
  if (run.guesses_used >= budget) {
    return NextResponse.json({ error: "out_of_guesses" }, { status: 409 });
  }

  const { data: secretRow } = await db
    .from("boxes")
    .select("secret, title, prize_kobo, contributor_id")
    .eq("id", box.id)
    .single();
  if (!secretRow) return NextResponse.json({ error: "box_not_found" }, { status: 404 });

  const feedback = scoreGuess(secretRow.secret as string, guess);
  const solved = isSolved(feedback);

  const ordinal = run.guesses_used;
  const { error: insertError } = await db
    .from("guesses")
    .insert({ run_id: run.id, ordinal, value: guess, feedback });
  if (insertError) {
    // 23505 is a unique violation: another request already took this ordinal.
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "already_guessing" }, { status: 409 });
    }
    console.error("[guess] insert failed:", insertError);
    return NextResponse.json({ error: "guess_failed" }, { status: 500 });
  }

  const used = ordinal + 1;
  const exhausted = !solved && used >= budget;

  // A solved run's status is `claim_box`'s to set: it decides between winning
  // and being pipped, and it uses the run still being active as the guard that
  // makes the life refund happen exactly once. Only the guess count is ours.
  await db
    .from("runs")
    .update({
      guesses_used: used,
      ...(exhausted ? { status: "lost", ended_at: new Date().toISOString() } : {}),
    })
    .eq("id", run.id);

  let outcome: "open" | "won" | "lost" | "pipped" = "open";
  if (solved) {
    const { data: claim } = await db.rpc("claim_box", { p_run_id: run.id });
    outcome = (claim as { result?: string } | null)?.result === "won" ? "won" : "pipped";
    if (outcome === "won") {
      await announce(db, {
        email,
        title: secretRow.title as string,
        prizeKobo: Number(secretRow.prize_kobo),
        contributorId: (secretRow.contributor_id as string | null) ?? null,
      });
    }
  } else if (exhausted) {
    outcome = "lost";
  }

  const view = await buildPlayView(db, (await findBox(db, slug)) ?? box, email);
  return NextResponse.json({ ...view, outcome, feedback });
}

/** Tell the winner, and tell whoever's money it was. Never blocks the answer. */
async function announce(
  db: ReturnType<typeof supabaseAdmin>,
  params: { email: string; title: string; prizeKobo: number; contributorId: string | null }
) {
  await sendBoxUnlockedEmail({
    to: params.email,
    title: params.title,
    prizeKobo: params.prizeKobo,
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
    prizeKobo: params.prizeKobo,
  });
}
