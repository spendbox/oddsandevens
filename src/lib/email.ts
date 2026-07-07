import { Resend } from "resend";

// All emails are fire-and-forget: a game result has already committed by the
// time we send, so a delivery failure must never surface as a game error.
// Without RESEND_API_KEY (local dev), emails are logged instead of sent.

const FROM = process.env.EMAIL_FROM ?? "TileHunt <onboarding@resend.dev>";

// Canonical app URL for links inside emails. On Vercel this falls back to the
// production domain automatically; set APP_URL to override (e.g. custom domain
// before it's the Vercel production domain, or non-Vercel hosting).
function appUrl(): string | null {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return null;
}

function boardLink(slug: string): string {
  const base = appUrl();
  return base
    ? `<p><a href="${base}/g/${slug}">Play again</a> once your cooldown ends.</p>`
    : "";
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

function formatExpiry(expiresAt: string) {
  return new Date(expiresAt).toUTCString();
}

export async function sendRewardUnlockedEmail(params: {
  to: string;
  businessName: string;
  slug: string;
  description: string;
  code: string;
  expiresAt: string;
}) {
  const { to, businessName, slug, description, code, expiresAt } = params;
  await send(
    to,
    `🎉 You won: ${description} at ${businessName}`,
    `<div style="font-family:sans-serif;max-width:480px">
      <h2>You hit a reward at ${businessName}!</h2>
      <p><strong>${description}</strong></p>
      <p>Show this code to staff to redeem it:</p>
      <p style="font-size:28px;letter-spacing:6px;font-weight:bold;background:#f4f4f5;padding:12px 16px;border-radius:8px;text-align:center">${code}</p>
      <p>⏳ Expires <strong>${formatExpiry(expiresAt)}</strong>. After that the code is invalid.</p>
      ${boardLink(slug)}
    </div>`
  );
}

export async function sendMerchantHitEmail(params: {
  to: string;
  businessName: string;
  description: string;
  customerEmail: string;
}) {
  const { to, businessName, description, customerEmail } = params;
  await send(
    to,
    `TileHunt: a customer just won "${description}"`,
    `<div style="font-family:sans-serif;max-width:480px">
      <h2>Reward unlocked on your grid</h2>
      <p>A customer (${customerEmail}) just won <strong>${description}</strong> at ${businessName}.</p>
      <p>They received a redemption code by email — your staff can redeem it from the dashboard when they visit.</p>
      ${appUrl() ? `<p><a href="${appUrl()}/dashboard">Open your dashboard</a></p>` : ""}
    </div>`
  );
}
