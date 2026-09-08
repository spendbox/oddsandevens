import 'server-only'

/**
 * Outbound email, through Resend.
 *
 * Everything Spendbox sends goes through here rather than through Supabase's
 * built-in mailer. That mailer is convenient and heavily rate limited — fine
 * while testing, and a silent failure the day real traffic arrives, because a
 * password reset that never lands looks to the player like a broken account.
 *
 * Written against Resend's HTTP API directly rather than their SDK, the same
 * way src/lib/paystack.ts is: it is one POST, and one less package to keep in
 * step with everything else.
 */

const BASE = 'https://api.resend.com'

export class EmailError extends Error {}

function apiKey(): string {
  const key = process.env.RESEND_API_KEY
  if (!key || !key.trim()) {
    throw new EmailError(
      'Email is not set up: RESEND_API_KEY is not set. Add it in Vercel under Settings → ' +
        'Environment Variables (resend.com → API Keys), then redeploy.',
    )
  }
  return key.trim()
}

/**
 * Who the mail comes from.
 *
 * Must be an address on a domain verified in Resend. Resend's onboarding
 * sender works without a domain but only delivers to your own address, which is
 * exactly the sort of thing that looks fine in testing and reaches nobody in
 * production — so the failure names it.
 */
function from(): string {
  const sender = process.env.EMAIL_FROM?.trim()
  if (!sender) {
    throw new EmailError(
      'Email is not set up: EMAIL_FROM is not set. Use an address on a domain you have ' +
        'verified in Resend, like "Spendbox <hello@yourdomain.com>".',
    )
  }
  return sender
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim())
}

export async function sendEmail(message: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<void> {
  const response = await fetch(`${BASE}/emails`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: from(),
      to: [message.to],
      subject: message.subject,
      html: message.html,
      // Every mail carries a plain-text part. Some clients prefer it, some
      // spam filters count its absence against you, and it costs one string.
      text: message.text,
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { message?: string; name?: string }
      | null

    // The status code matters as much as the text: 403 is almost always an
    // unverified sending domain, 422 a malformed address, 401 a bad key.
    throw new EmailError(
      `Resend returned ${response.status}` +
        (body?.name ? ` (${body.name})` : '') +
        (body?.message ? `: ${body.message}` : '.'),
    )
  }
}

/**
 * The house style for a Spendbox email.
 *
 * Deliberately not the app's dark arcade palette: half of email clients will
 * ignore the background and leave light text on white. Inline styles and a
 * table for the button, because Gmail strips <style> blocks and Outlook does
 * not do padding on anchors.
 */
export function emailShell(args: {
  heading: string
  body: string
  buttonLabel: string
  buttonUrl: string
  footer: string
}): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f2fa;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2fa;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="padding-bottom:20px;">
          <span style="font-size:20px;font-weight:700;color:#150c2e;letter-spacing:-0.5px;">Spendbox</span>
        </td></tr>
        <tr><td style="font-size:22px;font-weight:700;color:#150c2e;padding-bottom:12px;line-height:1.3;">
          ${args.heading}
        </td></tr>
        <tr><td style="font-size:15px;line-height:1.6;color:#4a4360;padding-bottom:24px;">
          ${args.body}
        </td></tr>
        <tr><td style="padding-bottom:24px;">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr><td style="background:#a855f7;border-radius:12px;">
              <a href="${args.buttonUrl}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${args.buttonLabel}</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="font-size:13px;line-height:1.6;color:#8a83a0;border-top:1px solid #ece9f5;padding-top:20px;">
          ${args.footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
