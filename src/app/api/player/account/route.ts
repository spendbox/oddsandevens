import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { EMAIL_REGEX } from "@/lib/constants";
import { playerEmail, rememberPlayer } from "@/lib/player-session";
import { verifyCode } from "@/lib/verification";
import { ensurePlayer, toPlayerState } from "@/lib/game/boxes";
import { newAccountAllowed, stampSignupIp } from "@/lib/game/limits";
import {
  hashPassword,
  needsRehash,
  passwordIsValid,
  verifyPassword,
  MIN_PASSWORD_LENGTH,
} from "@/lib/player-password";

/**
 * One route, four things a player can do with their account.
 *
 * They're together because they're the same conversation — "who are you, and
 * can you prove it?" — and splitting them across four files made the ordering
 * rules (a code before a reset, a session before a change) easy to get subtly
 * different in one of them.
 *
 *   check     does this address already have a password? Decides which form
 *             the dialog shows next, and is the one call that answers about an
 *             address the caller hasn't proved they own.
 *   sign-in   email + password → a session cookie.
 *   set       a verified code + a new password. Covers both signing up and
 *             resetting a forgotten one; they are the same operation.
 *   change    signed in + current password → a new one.
 */
type Action = "check" | "sign-in" | "set" | "change";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: Action;
    email?: string;
    password?: string;
    currentPassword?: string;
    code?: string;
  };

  const action = body.action ?? "sign-in";
  const addr = (body.email ?? "").trim().toLowerCase();
  const db = supabaseAdmin();

  // ---- check --------------------------------------------------------------
  // Deliberately truthful about whether an address is known. Hiding it would
  // mean asking everybody for a code they may not need, and the address is
  // already discoverable by trying to sign in — all the ambiguity would buy is
  // an extra email for every returning player.
  if (action === "check") {
    if (!EMAIL_REGEX.test(addr)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }
    const { data } = await db
      .from("players")
      .select("password_hash")
      .eq("email", addr)
      .maybeSingle();
    return NextResponse.json({
      known: !!data,
      hasPassword: !!(data as { password_hash?: string } | null)?.password_hash,
    });
  }

  // ---- sign in ------------------------------------------------------------
  if (action === "sign-in") {
    if (!EMAIL_REGEX.test(addr) || !body.password) {
      return NextResponse.json({ error: "invalid_credentials" }, { status: 400 });
    }
    const { data } = await db
      .from("players")
      .select("id, password_hash")
      .eq("email", addr)
      .maybeSingle();
    const row = data as { id: string; password_hash: string | null } | null;

    // One answer for "no such player", "no password set" and "wrong password".
    // A sign-in form that distinguishes them is an account enumerator.
    if (!(await verifyPassword(body.password, row?.password_hash))) {
      return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    }

    // Take the chance to upgrade a hash written under weaker parameters.
    if (needsRehash(row!.password_hash)) {
      await db
        .from("players")
        .update({ password_hash: await hashPassword(body.password) })
        .eq("id", row!.id);
    }

    const player = await ensurePlayer(db, addr);
    await rememberPlayer(addr);
    return NextResponse.json({ result: "signed_in", player: toPlayerState(player, addr) });
  }

  // ---- set (sign up, or reset a forgotten one) ----------------------------
  if (action === "set") {
    if (!EMAIL_REGEX.test(addr)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }
    if (!passwordIsValid(body.password ?? "")) {
      return NextResponse.json(
        { error: "weak_password", minLength: MIN_PASSWORD_LENGTH },
        { status: 400 }
      );
    }
    // The other door a new account can come through, so it carries the same
    // gate — and asks before the code is spent, for the same reason.
    if (!(await newAccountAllowed(db, req, addr))) {
      return NextResponse.json({ error: "too_many_accounts" }, { status: 429 });
    }

    // The code is the proof of ownership, so it is checked before anything is
    // written and a bad one is the end of it.
    const ok = await verifyCode(addr, "player_verify", (body.code ?? "").trim());
    if (!ok) return NextResponse.json({ error: "invalid_code" }, { status: 400 });

    const player = await ensurePlayer(db, addr);
    if (!player) return NextResponse.json({ error: "player_failed" }, { status: 500 });
    await stampSignupIp(db, req, player.id);

    await db
      .from("players")
      .update({
        password_hash: await hashPassword(body.password!),
        password_set_at: new Date().toISOString(),
      })
      .eq("id", player.id);

    await rememberPlayer(addr);
    return NextResponse.json({ result: "set", player: toPlayerState(player, addr) });
  }

  // ---- change (already signed in) -----------------------------------------
  if (action === "change") {
    const email = await playerEmail();
    if (!email) return NextResponse.json({ error: "not_verified" }, { status: 401 });
    if (!passwordIsValid(body.password ?? "")) {
      return NextResponse.json(
        { error: "weak_password", minLength: MIN_PASSWORD_LENGTH },
        { status: 400 }
      );
    }

    const { data } = await db
      .from("players")
      .select("id, password_hash")
      .eq("email", email)
      .maybeSingle();
    const row = data as { id: string; password_hash: string | null } | null;
    if (!row) return NextResponse.json({ error: "not_verified" }, { status: 401 });

    // An account that has never had a password can set one from a live session
    // without re-proving the address: the session *is* the proof, and it was
    // minted from a code.
    if (row.password_hash && !(await verifyPassword(body.currentPassword ?? "", row.password_hash))) {
      return NextResponse.json({ error: "wrong_password" }, { status: 403 });
    }

    await db
      .from("players")
      .update({
        password_hash: await hashPassword(body.password!),
        password_set_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    return NextResponse.json({ result: "changed" });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
