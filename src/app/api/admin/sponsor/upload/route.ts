import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin-auth";
import {
  SPONSOR_IMAGE_MAX_BYTES,
  SPONSOR_IMAGE_TYPES,
  SPONSOR_VIDEO_MAX_BYTES,
  SPONSOR_VIDEO_TYPES,
} from "@/lib/game/sponsors";

/**
 * A logo, or a picture of what a sponsor is giving away.
 *
 * The one place in this application that takes a file. Two things about that
 * are worth stating rather than discovering:
 *
 * **The browser never talks to storage.** The `sponsors` bucket has no RLS
 * policy, so the anon key cannot write to it at all — the upload comes here,
 * behind `getAdminUser()`, and the service role does the writing. That is the
 * same arrangement every other privileged write in this codebase uses, and it
 * is why there is no signed-upload-URL dance in the admin screen.
 *
 * **The content type is decided here and recorded.** The kind that comes back
 * is what the box row stores, and it is what decides between an `<img>` and a
 * `<video>` at render time. Nothing downstream sniffs a file extension, which
 * means nothing downstream can be fooled by one.
 *
 * The response is a URL rather than an object path because the bucket is public
 * and every reader wants the URL. Nothing here signs anything.
 */
export const runtime = "nodejs";

const BUCKET = "sponsors";

export async function POST(req: Request) {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }

  const type = file.type;
  const isImage = (SPONSOR_IMAGE_TYPES as readonly string[]).includes(type);
  const isVideo = (SPONSOR_VIDEO_TYPES as readonly string[]).includes(type);

  // An allow-list, not a block-list, and no SVG in it — see `sponsors.ts` for
  // why a scriptable document served from our own origin is not a logo.
  if (!isImage && !isVideo) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
  }

  // Checked here as well as at the bucket. The bucket's ceiling is the video's;
  // an image has its own, far lower one, and the difference is the whole reason
  // the front page doesn't end up carrying a 20MB PNG.
  const limit = isVideo ? SPONSOR_VIDEO_MAX_BYTES : SPONSOR_IMAGE_MAX_BYTES;
  if (file.size > limit) {
    return NextResponse.json(
      { error: "too_large", limitBytes: limit },
      { status: 413 }
    );
  }

  const db = supabaseAdmin();
  /*
   * The name is ours, not theirs.
   *
   * An uploaded filename is attacker-controlled text that would end up in a
   * public URL — path segments, control characters, a name that collides with
   * somebody else's file and silently replaces it. `crypto.randomUUID()` plus
   * the extension implied by the content type has none of those properties, and
   * nothing anywhere needs the original name.
   */
  const path = `${crypto.randomUUID()}.${EXTENSIONS[type]}`;

  const { error } = await db.storage.from(BUCKET).upload(path, file, {
    contentType: type,
    // A fresh path every time, so an overwrite would mean a UUID collision.
    upsert: false,
    // A year. These are immutable by construction: editing a sponsor's logo
    // uploads a new object rather than replacing one, so nothing behind a CDN
    // can go stale.
    cacheControl: "31536000",
  });

  if (error) {
    console.error("[admin] sponsor upload failed:", error);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = db.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({
    url: publicUrl,
    kind: isVideo ? "video" : "image",
  });
}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
};
