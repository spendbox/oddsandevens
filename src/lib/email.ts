import { Resend } from "resend";

// All emails are fire-and-forget: a game result has already committed by the
// time we send, so a delivery failure must never surface as a game error.
// Without RESEND_API_KEY (local dev), emails are logged instead of sent.

const FROM = process.env.EMAIL_FROM ?? "TileHunt <onboarding@resend.dev>";

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
  description: string;
  code: string;
  expiresAt: string;
}) {
  const { to, businessName, description, code, expiresAt } = params;
  await send(
    to,
    `🎉 You won: ${description} at ${businessName}`,
    `<div style="font-family:sans-serif;max-width:480px">
      <h2>You hit a reward at ${businessName}!</h2>
      <p><strong>${description}</strong></p>
      <p>Show this code to staff to redeem it:</p>
      <p style="font-size:28px;letter-spacing:6px;font-weight:bold;background:#f4f4f5;padding:12px 16px;border-radius:8px;text-align:center">${code}</p>
      <p>⏳ Expires <strong>${formatExpiry(expiresAt)}</strong>. After that the code is invalid.</p>
    </div>`
  );
}

export async function sendDiscountCodeEmail(params: {
  to: string;
  businessName: string;
  discountPercent: number;
  code: string;
  expiresAt: string;
}) {
  const { to, businessName, discountPercent, code, expiresAt } = params;
  await send(
    to,
    `Your ${discountPercent}% discount at ${businessName}`,
    `<div style="font-family:sans-serif;max-width:480px">
      <h2>Loyalty pays off!</h2>
      <p>You traded your points for <strong>${discountPercent}% off</strong> at ${businessName}.</p>
      <p>Show this code to staff to redeem it:</p>
      <p style="font-size:28px;letter-spacing:6px;font-weight:bold;background:#f4f4f5;padding:12px 16px;border-radius:8px;text-align:center">${code}</p>
      <p>⏳ Expires <strong>${formatExpiry(expiresAt)}</strong>.</p>
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
    </div>`
  );
}
