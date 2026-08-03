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

/** One-time 6-digit code for signup, password reset, or player verification. */
export async function sendVerificationCodeEmail(params: {
  to: string;
  code: string;
  purpose: "contributor_signup" | "password_reset" | "player_verify";
}) {
  const { to, code, purpose } = params;
  const heading =
    purpose === "password_reset"
      ? "Reset your Spendbox password"
      : purpose === "player_verify"
        ? "Confirm your email to play"
        : "Confirm your email";
  const intro =
    purpose === "password_reset"
      ? "Use this code to reset your password:"
      : purpose === "player_verify"
        ? "Enter this code so we know where to send the prize if you crack a safe:"
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
