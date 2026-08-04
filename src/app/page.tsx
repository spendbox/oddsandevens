import { supabaseAdmin } from "@/lib/supabase/admin";
import { PUBLIC_BOX_COLUMNS, toPublicBox, type BoxRow } from "@/lib/game/boxes";
import { PlayerProvider } from "@/components/player/player-context";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Landing } from "@/components/landing";
import type { PublicBox } from "@/lib/types";

const RECENT_UNLOCKS = 12;

/**
 * Rendered per request rather than prerendered.
 *
 * Nothing on this page touches a request-time API, so Next would happily build
 * it once and serve that forever — which would mean a box funded this morning
 * never appearing, and a safe cracked an hour ago still advertising a prize
 * that has already been paid out. The lobby is a live board.
 */
export const dynamic = "force-dynamic";

/**
 * The lobby.
 *
 * Boxes are no longer sorted by who made them. They used to be — ours above,
 * everyone else's below — which is a strange thing to hard-code when they play
 * identically, and it left the front page's shape at the mercy of who happened
 * to publish. What sits at the top is now whatever an admin has *featured*,
 * from either side; the rest is one list.
 */
export default async function Home() {
  const db = supabaseAdmin();

  const [{ data: live }, { data: cracked }] = await Promise.all([
    db
      .from("boxes")
      .select(PUBLIC_BOX_COLUMNS)
      .eq("status", "live")
      .order("featured_at", { ascending: false, nullsFirst: false })
      .order("reward_kobo", { ascending: false }),
    db
      .from("boxes")
      .select(PUBLIC_BOX_COLUMNS)
      .eq("status", "unlocked")
      .order("unlocked_at", { ascending: false })
      .limit(RECENT_UNLOCKS),
  ]);

  const rows = [...((live ?? []) as BoxRow[]), ...((cracked ?? []) as BoxRow[])];
  const names = await contributorNames(db, rows);
  const winners = await winnerEmails(db, rows);
  const decorate = (row: BoxRow): PublicBox =>
    toPublicBox(row, {
      contributor: row.contributor_id ? (names.get(row.contributor_id) ?? null) : null,
      winnerEmail: row.unlocked_by ? (winners.get(row.unlocked_by) ?? null) : null,
    });

  const liveBoxes = ((live ?? []) as BoxRow[]).map(decorate);
  const featured = liveBoxes.filter((box) => box.featured);

  return (
    <PlayerProvider>
      <SiteHeader />
      <main className="flex-1">
        <Landing
          featured={
            // Nothing featured yet is a real state on a young board, and an
            // empty hero is a worse answer than the best box we have.
            featured.length > 0 ? featured : liveBoxes.slice(0, 1)
          }
          locked={liveBoxes}
          cracked={((cracked ?? []) as BoxRow[]).map(decorate)}
        />
      </main>
      <SiteFooter />
    </PlayerProvider>
  );
}

type Db = ReturnType<typeof supabaseAdmin>;

async function contributorNames(db: Db, rows: BoxRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.contributor_id).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const { data } = await db.from("contributors").select("id, display_name").in("id", ids);
  return new Map(
    ((data ?? []) as { id: string; display_name: string }[]).map((c) => [c.id, c.display_name])
  );
}

async function winnerEmails(db: Db, rows: BoxRow[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.unlocked_by).filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const { data } = await db.from("players").select("id, email").in("id", ids);
  return new Map(((data ?? []) as { id: string; email: string }[]).map((p) => [p.id, p.email]));
}
