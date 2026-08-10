import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  BLURB_MAX,
  MAX_FUNDING_KOBO,
  MAX_LENGTH,
  MIN_LENGTH,
  TITLE_MAX,
} from "@/lib/constants";
import { alphabetOf, loadSymbols, withinAlphabet } from "@/lib/game/alphabet";
import { getAdminUser } from "@/lib/admin-auth";
import { toDesign } from "@/lib/game/designs";
import { PUBLIC_BOX_COLUMNS, slugify, toPublicBox, type BoxRow } from "@/lib/game/boxes";
import { applySeeding } from "@/lib/game/seeding";
import { toSponsorColumns, type SponsorInput } from "@/lib/game/sponsors";

/** Every box on the platform, whoever built it. */
export async function GET() {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("boxes")
    .select(`${PUBLIC_BOX_COLUMNS}, funding_kobo, platform_fee_kobo, created_at`)
    .order("created_at", { ascending: false })
    .limit(200);

  // An admin looking at an empty Boxes list needs to be able to find out why.
  // Silently, this read answers "you have no boxes" to a schema mismatch.
  if (error) console.error("[admin] box list failed to load:", error);

  const rows = (data ?? []) as (BoxRow & { funding_kobo: number; created_at: string })[];
  return NextResponse.json({
    boxes: rows.map((row) => ({
      ...toPublicBox(row),
      id: row.id,
      fundingKobo: Number(row.funding_kobo),
      createdAt: row.created_at,
    })),
  });
}

/**
 * Author the public box.
 *
 * The general box is free to play and funded by us, so there is nothing to
 * collect and no split to make: the reward is set outright — possibly to
 * nothing at all, which makes it a pure challenge — and the box goes live
 * immediately. Only one general box is playable at a time — the unique
 * index enforces it — so publishing a new one means retiring the old one
 * first, which this does.
 */
export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    blurb?: string;
    secret?: string;
    rewardKobo?: number;
    design?: string;
    /** Seeding, all optional. See 0044 for what each of these does and doesn't. */
    attemptsCount?: number;
    playersCount?: number;
    crackedBy?: string;
    crackedAt?: string;
    hunters?: unknown;
    /** A business behind it, all optional. See 0053. */
    sponsor?: SponsorInput;
  };

  const title = (body.title ?? "").trim();
  const blurb = (body.blurb ?? "").trim();
  // Taken exactly as typed: case is part of the password now.
  const secret = body.secret ?? "";
  const rewardKobo = Math.trunc(Number(body.rewardKobo ?? 0));
  // Decoration, so an unrecognised one is quietly the default rather than a
  // 400 — exactly as on a contributor's box.
  const design = toDesign(body.design);

  if (!title || title.length > TITLE_MAX) {
    return NextResponse.json({ error: "invalid_title" }, { status: 400 });
  }
  if (blurb.length > BLURB_MAX) {
    return NextResponse.json({ error: "invalid_blurb" }, { status: 400 });
  }
  if (secret.length < MIN_LENGTH || secret.length > MAX_LENGTH) {
    return NextResponse.json({ error: "invalid_length" }, { status: 400 });
  }
  // The live alphabet, same as a contributor's box: an admin editing the
  // symbol list edits what they can type into this field too.
  const allowed = new Set(alphabetOf(await loadSymbols(supabaseAdmin())));
  if (!withinAlphabet(secret, allowed)) {
    return NextResponse.json({ error: "invalid_characters" }, { status: 400 });
  }
  if (rewardKobo < 0 || rewardKobo > MAX_FUNDING_KOBO) {
    return NextResponse.json({ error: "invalid_reward" }, { status: 400 });
  }

  // A sponsor, if the form filled one in. Authored with the box rather than
  // added afterwards where possible, for the same reason seeding is: the
  // second request is the one that gets forgotten, and a box that goes live
  // for an hour without the business's name on it is an hour the business paid
  // for and didn't get. `PATCH` can still do it later — deals get signed after
  // safes get built — and both go through the same function.
  const sponsor = toSponsorColumns(body.sponsor ?? {});
  if (!sponsor.ok) {
    return NextResponse.json({ error: sponsor.error }, { status: 400 });
  }

  // Publishing used to close every other live platform box first, because the
  // schema allowed exactly one and "the public game" was singular. Both halves
  // of that are gone — 0032 dropped the index, and featuring decides what sits
  // at the top of the page now. A new box is a new box; the old ones keep
  // playing until somebody cracks them or an admin closes them by hand.
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("boxes")
    .insert({
      kind: "general",
      slug: slugify(title),
      title,
      blurb: blurb || null,
      secret,
      length: secret.length,
      funding_kobo: 0,
      reward_kobo: rewardKobo,
      platform_fee_kobo: 0,
      design,
      status: "live",
      published_at: new Date().toISOString(),
      ...sponsor.columns,
    })
    .select(PUBLIC_BOX_COLUMNS)
    .single();

  if (error) {
    console.error("[admin] general box create failed:", error);
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  // Seeding, if any was asked for. A box authored as already-cracked is one
  // request rather than two, because the second one is the one you forget.
  const created = data as BoxRow;
  const { box: seeded, changed } = await applySeeding(db, created.id, body, admin.email);

  return NextResponse.json({
    box: toPublicBox(seeded ?? created),
    seeded: changed,
  });
}

/**
 * The three editorial things we can do to a box: put a prize in it, feature
 * it, or withdraw it. An unlocked box is already finished; leave it.
 */
export async function PATCH(req: Request) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    boxId?: string;
    featured?: boolean;
    rewardKobo?: number;
    sponsor?: SponsorInput;
  };
  if (!body.boxId) return NextResponse.json({ error: "invalid_box" }, { status: 400 });

  const db = supabaseAdmin();

  // ---- The sponsor --------------------------------------------------------
  // Who is behind the box, and what they are giving the winner on top of our
  // money. Editable for the same reason the prize is: a deal is signed the week
  // after the safe went up as often as before it, and rebuilding the box to
  // record one would take its slug, its hunters and its attempts with it.
  //
  // Three rules, and only the first is new.
  //
  //   Ours only, exactly as the prize is. A contributor's reward is their
  //   funding minus our cut; a sponsorship is an arrangement between us and a
  //   business, and it is not ours to attach to somebody else's safe. The check
  //   constraint in 0053 says the same thing, and this is the half of it that
  //   can explain itself.
  //
  //   Downwards is allowed, unlike the prize. That looks like an inconsistency
  //   and isn't: a prize is a promise to a player who is spending lives against
  //   the figure on the card, while a sponsorship is a commercial relationship
  //   that can lapse. A business whose deal has ended has to be able to come
  //   off the board, and the only way to express that is an empty name.
  //
  //   A finished box keeps its sponsor. There is no status filter here on
  //   purpose — an `unlocked` box still shows who was behind it on the result
  //   screen, and a winner still has a reward coming from them.
  if (body.sponsor !== undefined) {
    const sponsor = toSponsorColumns(body.sponsor);
    if (!sponsor.ok) {
      return NextResponse.json({ error: sponsor.error }, { status: 400 });
    }

    const { data } = await db
      .from("boxes")
      .update(sponsor.columns)
      .eq("id", body.boxId)
      .eq("kind", "general")
      .select(PUBLIC_BOX_COLUMNS)
      .maybeSingle();

    if (data) {
      return NextResponse.json({ result: "sponsored", box: toPublicBox(data as BoxRow) });
    }

    // Nothing moved, and "that box isn't ours" and "that box doesn't exist" are
    // different answers to an admin looking at a list that contains both kinds.
    const { data: current } = await db
      .from("boxes")
      .select("kind")
      .eq("id", body.boxId)
      .maybeSingle();

    if (!current) return NextResponse.json({ error: "box_not_found" }, { status: 404 });
    return NextResponse.json({ error: "not_ours" }, { status: 409 });
  }

  // ---- The prize ----------------------------------------------------------
  // The create form is not the only moment an admin decides what a box is
  // worth. A box goes up as a pure challenge and earns a prize once people
  // start attacking it; a headline number gets agreed the week after the safe
  // was built. Both of those used to mean deleting the box and starting again,
  // taking its hunters and its attempts with it.
  //
  // Two rules, and both are the ones already in force elsewhere:
  //
  //   Ours only. A contributor's reward is their funding minus our cut and
  //   nothing else — `raise_reward` is how that number moves, against money
  //   actually collected. Topping one up from here would advertise a reward
  //   with nothing behind it.
  //
  //   Upwards only. A player deciding a box is worth weeks of lives has to be
  //   able to trust the figure they read, which is exactly why `raise_reward`
  //   refuses to lower a contributor's. The platform's own boxes are played
  //   with the same lives and get the same guarantee. The remedy for a prize
  //   typed wrong is the one it has always been: close the box.
  if (body.rewardKobo !== undefined) {
    const rewardKobo = Math.trunc(Number(body.rewardKobo));
    if (!Number.isSafeInteger(rewardKobo) || rewardKobo < 0 || rewardKobo > MAX_FUNDING_KOBO) {
      return NextResponse.json({ error: "invalid_reward" }, { status: 400 });
    }

    // One statement, so two admins raising at once cannot race each other into
    // a lower number: `lte` is the "upwards only" rule, and it lets a repeat
    // save of the same figure through as the no-op it is.
    const { data } = await db
      .from("boxes")
      .update({ reward_kobo: rewardKobo })
      .eq("id", body.boxId)
      .eq("kind", "general")
      .in("status", ["draft", "funding", "live"])
      .lte("reward_kobo", rewardKobo)
      .select(PUBLIC_BOX_COLUMNS)
      .maybeSingle();

    if (data) {
      return NextResponse.json({ result: "priced", box: toPublicBox(data as BoxRow) });
    }

    // Nothing moved. Read the box back rather than guessing, because "that
    // isn't ours", "that one is finished" and "that would lower it" are three
    // different answers and only one of them is the admin's mistake.
    const { data: current } = await db
      .from("boxes")
      .select("kind, status, reward_kobo")
      .eq("id", body.boxId)
      .maybeSingle();
    const box = current as Pick<BoxRow, "kind" | "status" | "reward_kobo"> | null;

    if (!box) return NextResponse.json({ error: "box_not_found" }, { status: 404 });
    if (box.kind !== "general") {
      return NextResponse.json({ error: "not_ours" }, { status: 409 });
    }
    if (!["draft", "funding", "live"].includes(box.status)) {
      return NextResponse.json({ error: "box_not_open" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "would_lower", rewardKobo: Number(box.reward_kobo) },
      { status: 409 }
    );
  }

  // ---- Featuring ----------------------------------------------------------
  // Editorial rather than structural: whichever boxes are worth the top of the
  // landing page, however many, whoever made them. Only a *live* box can be
  // featured — `claim_box` clears the flag the moment somebody cracks one, and
  // this is the other half of that rule.
  if (typeof body.featured === "boolean") {
    const { data } = await db
      .from("boxes")
      .update({ featured_at: body.featured ? new Date().toISOString() : null })
      .eq("id", body.boxId)
      .eq("status", "live")
      .select("id")
      .maybeSingle();

    if (!data) {
      return NextResponse.json({ error: "not_featurable" }, { status: 409 });
    }
    return NextResponse.json({ result: body.featured ? "featured" : "unfeatured" });
  }

  // ---- Closing ------------------------------------------------------------
  const { data } = await db
    .from("boxes")
    .update({ status: "closed", featured_at: null })
    .eq("id", body.boxId)
    .in("status", ["draft", "funding", "live"])
    .select("id")
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "box_not_found" }, { status: 404 });
  return NextResponse.json({ result: "closed" });
}
