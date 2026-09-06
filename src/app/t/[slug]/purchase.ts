'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { PaystackError, startCheckout, verifyPayment } from '@/lib/paystack'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { supabaseServer } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/session'

async function siteOrigin(): Promise<string> {
  const list = await headers()
  const host = list.get('x-forwarded-host') ?? list.get('host') ?? 'localhost:3000'
  const protocol = list.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${protocol}://${host}`
}

export async function beginPurchase(
  toolId: string,
  slug: string,
): Promise<{ url: string | null; error: string | null }> {
  const { userId } = await requireProfile()
  const supabase = await supabaseServer()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: tool } = await supabase
    .from('tools')
    .select('id, price_kobo, currency, status, owner_id, owner:profiles(paystack_subaccount)')
    .eq('id', toolId)
    .maybeSingle()

  if (!tool || tool.status !== 'published') return { url: null, error: 'This tool is not available.' }
  if (tool.price_kobo <= 0) return { url: null, error: 'This tool is free — no payment needed.' }
  if (tool.owner_id === userId) return { url: null, error: 'This is your own tool.' }

  const reference = `forge_${toolId.slice(0, 8)}_${userId.slice(0, 8)}_${Date.now().toString(36)}`

  const { error: insertError } = await supabase.from('purchases').insert({
    tool_id: toolId,
    buyer_id: userId,
    reference,
    amount_kobo: tool.price_kobo,
    currency: tool.currency,
    status: 'pending',
  })

  if (insertError) return { url: null, error: 'Could not start the payment. Try again.' }

  const subaccount =
    (tool as unknown as { owner?: { paystack_subaccount: string | null } | null }).owner
      ?.paystack_subaccount ?? null

  try {
    const checkout = await startCheckout({
      email: user?.email ?? '',
      amountKobo: tool.price_kobo,
      reference,
      callbackUrl: `${await siteOrigin()}/t/${slug}/paid?reference=${reference}`,
      subaccount,
    })
    return { url: checkout.authorization_url, error: null }
  } catch (error) {
    return {
      url: null,
      error: error instanceof PaystackError ? error.message : 'Could not reach Paystack.',
    }
  }
}

/**
 * Confirm a payment by asking Paystack, never by trusting the redirect. A buyer
 * arriving back at this URL proves only that their browser went somewhere.
 */
export async function confirmPurchase(reference: string, slug: string): Promise<boolean> {
  const supabase = await supabaseServer()

  const { data: purchase } = await supabase
    .from('purchases')
    .select('id, status, amount_kobo')
    .eq('reference', reference)
    .maybeSingle()

  if (!purchase) return false
  if (purchase.status === 'paid') return true

  try {
    const result = await verifyPayment(reference)
    if (result.status !== 'success' || result.amount < purchase.amount_kobo) return false
  } catch {
    return false
  }

  // The buyer cannot write this themselves — no policy lets them — so the flip
  // to paid is made with the service role, and only now that Paystack has
  // confirmed the amount.
  try {
    const { error } = await supabaseAdmin()
      .from('purchases')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('reference', reference)
      .eq('status', 'pending')

    if (error) return false
  } catch {
    // No service role key configured. The money has left the buyer's account,
    // so failing quietly here would be the worst outcome — say so loudly in the
    // logs, and leave the purchase pending for a human to settle.
    console.error(
      '[forge] payment verified with Paystack but could not be recorded: ' +
        'SUPABASE_SERVICE_ROLE_KEY is not set. Reference: ' + reference,
    )
    return false
  }

  revalidatePath(`/t/${slug}`)
  return true
}
