import { ImageResponse } from "next/og";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { findBox } from "@/lib/game/view";
import { toSponsor } from "@/lib/game/sponsors";
import { isShareFormat, SHARE_SPECS, shareFileName } from "@/lib/game/share-kit";
import { poster } from "./poster";
import { posterFonts } from "../../fonts";

/**
 * A poster for a box, drawn on demand.
 *
 * This is the artwork a sponsor posts to their own customers, so it is public
 * and unauthenticated on purpose: the point is a URL that WhatsApp, Instagram
 * and X can all fetch, and anything behind a session is a picture nobody can
 * share. Nothing in it is private — the title, the reward and the sponsor's own
 * name are all already on the box's public page.
 *
 * The drawing lives in `poster.tsx` so that it can be rendered from a script
 * with invented data and looked at. This file is only the part that knows where
 * the data comes from and what the caching rules are.
 */
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; format: string }> }
) {
  const { slug, format } = await params;
  if (!isShareFormat(format)) {
    return new Response("Unknown format", { status: 404 });
  }

  const box = await findBox(supabaseAdmin(), slug);
  // A draft or a box awaiting funding has nothing to advertise yet, and a
  // poster for one is a link to a page that 404s.
  if (!box || box.status === "draft" || box.status === "funding") {
    return new Response("No such box", { status: 404 });
  }

  const spec = SHARE_SPECS[format];

  return new ImageResponse(
    poster(
      {
        title: box.title,
        rewardKobo: Number(box.reward_kobo),
        sponsor: toSponsor(box),
      },
      format,
      spec
    ),
    {
      width: spec.width,
      height: spec.height,
      // Without these every ₦ is a tofu box: Satori's default face is Geist,
      // which has no naira sign. See `fonts.ts`.
      fonts: await posterFonts(),
      headers: {
        /*
         * Long-lived and public, because these are fetched by the crawler of
         * every platform the sponsor posts to and then by every customer who
         * sees the post. Rendering a PNG per view would make a campaign that
         * worked the thing that took the site down.
         *
         * Not `immutable`, though: a prize can be raised, and a poster
         * advertising yesterday's figure should heal within the hour on its
         * own rather than never.
         */
        "cache-control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
        // `inline`, so the URL previews in a browser and in an email client.
        // The kit page's download button is what forces a save.
        "content-disposition": `inline; filename="${shareFileName(slug, format)}"`,
      },
    }
  );
}
