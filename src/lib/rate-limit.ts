// A speed limit on the endpoints where guessing is the attack.
//
// Three routes here accept a secret and answer yes or no: the admin password,
// and the two that take a six-digit code. Every one of them was answering as
// fast as it could be asked. The code routes have a per-code ceiling in the
// database and the admin password has nothing at all — `ADMIN_PASSWORD` could
// be tried a few thousand times a second by anybody who found `/admin`.
//
// This is deliberately the small version of the idea: an in-process sliding
// window, no table, no Redis. It is worth being clear about what that buys and
// what it doesn't. Serverless runs many instances, so a determined attacker
// spread across enough cold starts gets a multiple of these numbers — the
// point is to turn "unlimited" into "a rate that leaves a bill and a graph",
// not to be a wall. The wall for the codes is the attempt counter in
// `verification_codes`, which is per code and shared by every instance.
//
// Memory is bounded by expiring keys on read: a key nobody touches inside its
// window stops existing the next time the map is swept.

interface Window {
  hits: number[];
  /** When every hit in this window will have aged out. */
  until: number;
}

const WINDOWS = new Map<string, Window>();

/** Sweep at most this often, so a busy route isn't walking the map per call. */
const SWEEP_MS = 60_000;
let sweptAt = 0;

function sweep(now: number): void {
  if (now - sweptAt < SWEEP_MS) return;
  sweptAt = now;
  for (const [key, window] of WINDOWS) {
    if (window.until <= now) WINDOWS.delete(key);
  }
}

/**
 * Record an attempt and say whether it should be refused.
 *
 * Returns true when the caller has already had `limit` attempts inside
 * `windowMs`. The attempt is counted either way — a refused request is still
 * an attempt, and not counting it would let somebody hammer the limit's edge
 * forever.
 */
export function tooMany(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now);

  const window = WINDOWS.get(key);
  const hits = (window?.hits ?? []).filter((at) => at > now - windowMs);
  hits.push(now);
  WINDOWS.set(key, { hits, until: now + windowMs });

  return hits.length > limit;
}

/**
 * Who is asking, as far as anything here can tell.
 *
 * The first entry in `x-forwarded-for` is the client as the edge saw it. It is
 * forgeable in principle and not in practice behind Vercel, which overwrites
 * the header — and an attacker who *can* forge it is defeated by the per-code
 * ceiling rather than by this.
 */
export function callerKey(req: Request, scope: string): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return `${scope}:${ip}`;
}
