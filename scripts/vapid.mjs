// Generate a VAPID keypair.
//
// Run once per deployment: `npm run vapid`, then paste the two lines into the
// environment. Nothing about the pair is derived from anything else, so it can
// be generated anywhere — but it must then stay put.
//
// **Rotating the private key invalidates every existing subscription.** A push
// subscription is bound to the public key that created it, so a new pair means
// every phone that had opted in silently stops receiving anything and has to
// be asked again. Treat these like the service-role key: set once, keep.

import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

// `npm run vapid -- mailto:someone@example.com` to set the contact address in
// the output directly, rather than printing a placeholder to be edited later.
const subject = process.argv[2] ?? "mailto:spendbox@gmail.com";
if (!/^(mailto:|https:)/.test(subject)) {
  console.error(`\nVAPID_SUBJECT must start with mailto: or https: — got "${subject}"\n`);
  process.exit(1);
}

console.log(`
Add these to your environment (and to Vercel, for the deployed one):

# The public half is sent to every browser that subscribes. It is not a secret,
# which is why it carries the NEXT_PUBLIC_ prefix.
NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}

# The private half signs each push. Server-only, and never rotated casually —
# a new pair silently unsubscribes everybody who has already opted in.
VAPID_PRIVATE_KEY=${privateKey}

# Where a push service should complain if we misbehave. mailto: or https: only.
VAPID_SUBJECT=${subject}
`);
