import { webhookIsGenuine } from '@/lib/paystack'
import { creditTopup } from '@/lib/wallet'

/**
 * Paystack telling us a payment happened.
 *
 * This is the reliable half of the pair. The browser callback only fires if the
 * player waits for the redirect; the webhook fires whether they closed the tab,
 * ran out of battery, or paid from a different device entirely.
 *
 * The body has to be read as raw text, because the signature is over the exact
 * bytes Paystack sent. Parsing it first and re-serialising would change a space
 * somewhere and fail every check.
 *
 * Always answers 200. Paystack retries anything else, and there is nothing to
 * gain from being retried over a reference we have already dealt with.
 */
export async function POST(request: Request) {
  const raw = await request.text()

  if (!webhookIsGenuine(raw, request.headers.get('x-paystack-signature'))) {
    return Response.json({ ok: false }, { status: 401 })
  }

  const event = JSON.parse(raw) as { event?: string; data?: { reference?: string } }

  if (event.event !== 'charge.success' || !event.data?.reference) {
    return Response.json({ ok: true, ignored: true })
  }

  try {
    await creditTopup(event.data.reference)
  } catch {
    // Swallowed on purpose: the topup row still says pending, so the browser
    // callback or a retry can finish the job. Failing loudly here just makes
    // Paystack hammer the endpoint.
  }

  return Response.json({ ok: true })
}
