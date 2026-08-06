import { Resend } from "resend";
import { formatNaira, rewardLabel } from "@/lib/game/rewards";

// All emails are fire-and-forget: by the time one is sent the box has already
// been unlocked or the code already stored, so a delivery failure must never
// surface as a game error. Without RESEND_API_KEY (local dev), emails are
// logged instead of sent.

const FROM = process.env.EMAIL_FROM ?? "Spendbox <notifications@spendbox.site>";

function appUrl(): string | null {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return null;
}

function link(path: string, label: string): string {
  const base = appUrl();
  return base ? `<p><a href="${base}${path}">${label}</a></p>` : "";
}

function resend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

async function send(to: string, subject: string, html: string) {
  try {
    const client = resend();
    if (!client) {
      console.log(`[email:dev] to=${to} subject="${subject}"`);
      return;
    }
    const { error } = await client.emails.send({ from: FROM, to, subject, html });
    if (error) console.error("[email] send failed:", error);
  } catch (err) {
    console.error("[email] send failed:", err);
  }
}

const WRAP = 'style="font-family:sans-serif;max-width:480px"';
const CODE_STYLE =
  "font-size:32px;letter-spacing:8px;font-weight:bold;background:#f4f4f5;padding:14px 16px;border-radius:8px;text-align:center";

/** One-time 6-digit code for signup, a reset, verification, or a deletion. */
export async function sendVerificationCodeEmail(params: {
  to: string;
  code: string;
  purpose:
    | "contributor_signup"
    | "password_reset"
    | "player_verify"
    | "admin_delete_box";
}) {
  const { to, code, purpose } = params;
  const heading =
    purpose === "password_reset"
      ? "Reset your Spendbox password"
      : purpose === "player_verify"
        ? "Confirm your email to play"
        : purpose === "admin_delete_box"
          ? "Confirm a box deletion"
          : "Confirm your email";
  const intro =
    purpose === "password_reset"
      ? "Use this code to reset your password:"
      : purpose === "player_verify"
        ? "Enter this code so we know where to send the reward if you crack a safe:"
        : purpose === "admin_delete_box"
          ? "Somebody signed in to Spendbox admin is deleting a box permanently. If that wasn't you, ignore this and change the admin password immediately."
          : "Enter this code to finish creating your Spendbox account:";
  await send(
    to,
    `${code} is your Spendbox code`,
    `<div ${WRAP}>
      <h2>${heading}</h2>
      <p>${intro}</p>
      <p style="${CODE_STYLE}">${code}</p>
      <p>It expires in 10 minutes. If you didn't request this, you can ignore
      this email.</p>
    </div>`
  );
}

/** To the winner, the moment a safe opens. */
export async function sendBoxUnlockedEmail(params: {
  to: string;
  title: string;
  rewardKobo: number;
}) {
  const { to, title, rewardKobo } = params;
  await send(
    to,
    `🔓 You cracked "${title}" — ${rewardLabel(rewardKobo)}`,
    `<div ${WRAP}>
      <h2>The safe is open.</h2>
      <p>You guessed the password on <strong>${title}</strong> and won
      <strong>${rewardLabel(rewardKobo)}</strong>.</p>
      <p>Tell us where to send it — add your bank account and we'll transfer
      the prize.</p>
      ${link("/me", "Claim your prize")}
    </div>`
  );
}

/** To the contributor, when their box is cracked. */
export async function sendBoxCrackedEmail(params: {
  to: string;
  title: string;
  player: string;
  rewardKobo: number;
}) {
  const { to, title, player, rewardKobo } = params;
  await send(
    to,
    `Your spendbox "${title}" has been cracked`,
    `<div ${WRAP}>
      <h2>Somebody got it</h2>
      <p>${player} guessed the password on <strong>${title}</strong> and has
      won the ${rewardLabel(rewardKobo)} reward. The box is now closed and can't
      be played again.</p>
      <p>Everything players spent on power-ups while attacking it is still
      yours — build another one whenever you like.</p>
      ${link("/dashboard", "Open your dashboard")}
    </div>`
  );
}

/** To the contributor, once their stake clears and the box is playable. */
export async function sendBoxLiveEmail(params: {
  to: string;
  title: string;
  slug: string;
  rewardKobo: number;
}) {
  const { to, title, slug, rewardKobo } = params;
  const base = appUrl();
  await send(
    to,
    `"${title}" is live`,
    `<div ${WRAP}>
      <h2>Your spendbox is live</h2>
      <p><strong>${title}</strong> is open, with ${rewardLabel(rewardKobo)}
      behind the password.</p>
      ${base ? `<p>Share this link: <a href="${base}/b/${slug}">${base}/b/${slug}</a></p>` : ""}
      ${link("/dashboard", "Open your dashboard")}
    </div>`
  );
}

/** To the winner, when an admin sends the transfer. */
export async function sendRewardPaidEmail(params: {
  to: string;
  title: string;
  amountKobo: number;
  accountName: string | null;
}) {
  const { to, title, amountKobo, accountName } = params;
  await send(
    to,
    `${formatNaira(amountKobo)} is on its way`,
    `<div ${WRAP}>
      <h2>Prize sent</h2>
      <p>We've transferred <strong>${formatNaira(amountKobo)}</strong> for
      <strong>${title}</strong>${accountName ? ` to ${accountName}` : ""}.</p>
      <p>Bank transfers usually land within a few minutes.</p>
      ${link("/", "Find another safe")}
    </div>`
  );
}

/**
 * Where an operational notice goes.
 *
 * `ADMIN_EMAIL` if there is one, otherwise the first address on `ADMIN_EMAILS`
 * — the same two variables that decide who may sign in to `/admin`, so the
 * person told about a payout is by construction somebody able to make it.
 */
function adminAddress(): string | null {
  const dedicated = process.env.ADMIN_EMAIL?.trim();
  if (dedicated) return dedicated;
  const first = (process.env.ADMIN_EMAILS ?? "").split(",")[0]?.trim();
  return first || null;
}

/**
 * Somebody is owed money and can now be paid.
 *
 * Payouts are made by hand from the admin ledger, which means the whole system
 * waits on an administrator *noticing*. Until now the only way to notice was to
 * open `/admin` and look, so the clock on "within 24 hours" started whenever
 * somebody happened to check. This closes that: the moment a payout becomes
 * *payable* — not when it is created — the person who can send it is told.
 *
 * "Payable" is the important word, and it is why this fires from three places
 * rather than one. A prize with no account behind it is not payable, and an
 * account with no prize behind it is not either; whichever of the two arrives
 * second is the thing that makes it actionable, and that is the moment worth
 * an email.
 *
 * Fire-and-forget like everything else here. An administrator's inbox must
 * never be able to fail a player's bank details being saved.
 */
export async function sendAdminPayoutDueEmail(params: {
  kind: "prize" | "contributor";
  /** Masked for a player, the trading name for a contributor. */
  who: string;
  amountKobo: number;
  /** The safe involved, when there is one. */
  title?: string | null;
  accountName?: string | null;
  bankName?: string | null;
}) {
  const to = adminAddress();
  if (!to) return;

  const { kind, who, amountKobo, title, accountName, bankName } = params;
  const what = kind === "prize" ? "Prize" : "Contributor share";
  const where = kind === "prize" ? "/admin" : "/admin";

  await send(
    to,
    `${what} ready to pay — ${formatNaira(amountKobo)} to ${who}`,
    `<div ${WRAP}>
      <h2>${what} ready to pay</h2>
      <p><strong>${formatNaira(amountKobo)}</strong> is owed to <strong>${who}</strong>${
        title ? ` for <strong>${title}</strong>` : ""
      }, and there is now an account to send it to.</p>
      ${
        accountName
          ? `<p>${accountName}${bankName ? ` &middot; ${bankName}` : ""}</p>`
          : ""
      }
      <p>Nothing is transferred automatically. This is waiting on somebody
      pressing the button.</p>
      ${link(where, "Open the admin ledger")}
    </div>`
  );
}

/** Where issue reports go. Fixed, and never taken from a request. */
const SUPPORT_INBOX = "spendbox@gmail.com";

/**
 * Escape anything a stranger typed before it goes anywhere near HTML.
 *
 * Everything else in this file interpolates values we produced. This one
 * interpolates a free-text field from an unauthenticated form, so it is the
 * only place that can carry a `<script>` into an inbox — and a support inbox
 * is exactly where somebody would aim one.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Somebody has reported a problem. */
export async function sendIssueReportEmail(params: {
  message: string;
  /** Their address, if we have one. */
  from: string | null;
  /** True when it came from their session rather than a text field. */
  verified: boolean;
  /** The screen they reported from. */
  context: string | null;
  userAgent: string;
}) {
  const { message, from, verified, context, userAgent } = params;
  const who = from ? escapeHtml(from) : "not given";

  await send(
    SUPPORT_INBOX,
    `Issue report${context ? ` — ${context}` : ""}`,
    `<div ${WRAP}>
      <h2>Somebody reported a problem</h2>
      <p style="white-space:pre-wrap;background:#f4f4f5;padding:12px;border-radius:8px">${escapeHtml(
        message
      )}</p>
      <hr>
      <p style="font-size:13px;color:#52525b">
        <strong>From:</strong> ${who}${verified ? " (signed in)" : " (typed, unverified)"}<br>
        ${context ? `<strong>Where:</strong> ${escapeHtml(context)}<br>` : ""}
        <strong>Browser:</strong> ${escapeHtml(userAgent)}
      </p>
    </div>`
  );
}

/** To a contributor, when an admin records a transfer of their share. */
export async function sendPayoutSentEmail(params: {
  to: string;
  amountKobo: number;
  accountName: string | null;
  note?: string | null;
}) {
  const { to, amountKobo, accountName, note } = params;
  await send(
    to,
    `${formatNaira(amountKobo)} sent to you`,
    `<div ${WRAP}>
      <h2>Your share is on its way</h2>
      <p>We've transferred <strong>${formatNaira(amountKobo)}</strong>${
        accountName ? ` to ${accountName}` : ""
      } — your cut of everything players have spent on your safes.</p>
      ${note ? `<p>Reference: ${note}</p>` : ""}
      <p>Bank transfers usually land within a few minutes. Everything earned
      and everything sent is on your dashboard.</p>
      ${link("/dashboard", "Open your dashboard")}
    </div>`
  );
}
