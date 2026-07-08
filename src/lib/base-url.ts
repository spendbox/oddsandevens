// Canonical, publicly-reachable base URL for building redirect/callback links
// (e.g. the Paystack callback). Behind a proxy, `new URL(req.url).origin` can
// be an internal address that Paystack can't redirect back to, so prefer an
// explicit APP_URL, then the forwarded host, then the deployment domain.
export function appBaseUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");

  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  if (host) return `${proto}://${host}`;

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return new URL(req.url).origin;
}
