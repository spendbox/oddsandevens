import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The two faces a poster is drawn with, read from disk once.
 *
 * **Satori's default font is Geist, and Geist has no U+20A6 NAIRA SIGN.** Every
 * `₦` on a generated image came out as a tofu box — on the largest element of
 * the artwork, on a product priced entirely in naira. Nothing in CSS fixes
 * that; the glyph has to be supplied, so these are supplied.
 *
 * They are subsets of Liberation Sans at ~50KB each rather than the ~400KB
 * originals. See `fonts/README.md` for what is in them and how to rebuild one,
 * and `fonts/LICENSE.txt` for the OFL terms that permit both the bundling and
 * the subsetting.
 *
 * Cached in a module-level promise, because a poster is rendered per request
 * per crawler and reading 100KB off disk each time is work that has one answer.
 * The promise rather than the bytes: two requests arriving together should
 * share one read rather than race into two.
 */

export interface PosterFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: "normal";
}

let cached: Promise<PosterFont[]> | null = null;

export function posterFonts(): Promise<PosterFont[]> {
  cached ??= load();
  return cached;
}

async function load(): Promise<PosterFont[]> {
  // `process.cwd()` rather than a URL relative to this module: the route that
  // uses these is bundled, so `import.meta.url` points into `.next` where the
  // .ttf files are not. Next traces and copies files referenced this way into
  // the deployment output.
  const dir = path.join(process.cwd(), "src/app/api/share/fonts");
  const [regular, bold] = await Promise.all([
    readFile(path.join(dir, "poster-regular.ttf")),
    readFile(path.join(dir, "poster-bold.ttf")),
  ]);

  /*
   * Two weights, not five. Satori picks the nearest available weight rather
   * than synthesising one, so 600/800/900 in the poster all land on bold —
   * which is what the design wants, and four more files to say so would be
   * 200KB spent on a distinction nobody can see at poster size.
   */
  return [
    { name: "Spendbox Poster", data: toArrayBuffer(regular), weight: 400, style: "normal" },
    { name: "Spendbox Poster", data: toArrayBuffer(bold), weight: 700, style: "normal" },
  ];
}

/**
 * A Node `Buffer` is a view into a pool that may be much larger than the file,
 * so handing `.buffer` straight to Satori would hand it a slice of somebody
 * else's memory as well. This copies out exactly the bytes read.
 */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
