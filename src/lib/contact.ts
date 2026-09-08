/**
 * The domain Spendbox runs on, and the address people reach a human at.
 *
 * One place, so it cannot drift between pages — and so the email setup can
 * check itself against it. Mail must be sent from an address on this domain,
 * verified in Resend; Resend refuses to send from anywhere else.
 */
export const SITE_DOMAIN = 'spendbox.site'

export const CONTACT_EMAIL = `notifications@${SITE_DOMAIN}`

/** The sender used when EMAIL_FROM has not been set. */
export const DEFAULT_EMAIL_FROM = `Spendbox <${CONTACT_EMAIL}>`
