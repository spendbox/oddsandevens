import { NextResponse } from "next/server";
import { sendIssueReportEmail } from "@/lib/email";
import { callerKey, tooMany } from "@/lib/rate-limit";
import { playerEmail } from "@/lib/player-session";

/**
 * Somebody telling us something is wrong.
 *
 * Deliberately open to anybody, signed in or not — the reports worth most are
 * from the player who *cannot* sign in, and a support form behind a login is a
 * form that never hears about the login being broken.
 *
 * That openness is also the whole risk: this endpoint turns an HTTP request
 * into an email, which is a spam relay if it is left unguarded. Three things
 * hold it down, and none of them is clever:
 *
 *   **A rate limit per address.** Three in ten minutes. In-process, so a
 *   serverless fleet gives an attacker a multiple of that — see the note in
 *   `rate-limit.ts` — but it turns "unlimited" into "leaves a graph".
 *
 *   **The destination is a constant.** Nothing in the request can redirect
 *   where this goes. The reporter's own address is data inside the body, never
 *   a header, so it cannot be used to inject one.
 *
 *   **Everything is length-capped and escaped** before it is put in HTML.
 *
 * Signed-in players do not have to type their address and are labelled as
 * verified in the email, because a report from a known account is worth more
 * than one from a stranger and the two should be distinguishable at a glance.
 */

const MAX_MESSAGE = 4_000;
const MAX_FIELD = 200;

export async function POST(req: Request) {
  if (tooMany(callerKey(req, "report"), 3, 10 * 60_000)) {
    return NextResponse.json({ error: "too_many" }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    message?: string;
    email?: string;
    /** Where they were when it went wrong. Set by the button, not typed. */
    context?: string;
  };

  const message = String(body.message ?? "").trim().slice(0, MAX_MESSAGE);
  if (message.length < 5) {
    return NextResponse.json({ error: "too_short" }, { status: 400 });
  }

  // A signed-in player's address is taken from their session rather than from
  // what was typed: it is the one field in this payload we can actually trust,
  // and it is the difference between a report we can reply to and one we can't.
  const session = await playerEmail();
  const typed = String(body.email ?? "").trim().slice(0, MAX_FIELD);
  const context = String(body.context ?? "").trim().slice(0, MAX_FIELD);

  await sendIssueReportEmail({
    message,
    from: session ?? (typed || null),
    verified: !!session,
    context: context || null,
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, MAX_FIELD),
  });

  return NextResponse.json({ result: "sent" });
}
