/**
 * Where people reach a human. One place, so it cannot drift between pages.
 *
 * It must be on a domain verified in Resend, which means spendbox.site — the
 * domain this runs on. It was spendbox.com, which we do not own: Resend
 * refuses to send from an unverified domain, so every password reset was
 * being rejected before it left the building.
 */
export const CONTACT_EMAIL = 'notifications@spendbox.site'
