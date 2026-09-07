import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/session'
import { creditTopup } from '@/lib/wallet'

export const metadata = { title: 'Confirming payment' }
export const dynamic = 'force-dynamic'

/**
 * Where Paystack sends the player after checkout.
 *
 * The reference in the URL is only a hint that it is worth asking Paystack a
 * question. creditTopup does the asking, and is safe to run again — the webhook
 * has very often beaten the browser here by a second or two.
 */
export default async function PaymentReturnPage({
  searchParams,
}: PageProps<'/wallet/return'>) {
  await requireProfile()
  const params = await searchParams

  const reference =
    typeof params.reference === 'string'
      ? params.reference
      : typeof params.trxref === 'string'
        ? params.trxref
        : null

  if (!reference) redirect('/wallet')

  try {
    const result = await creditTopup(reference)

    if (!result.ok) redirect('/wallet?problem=verify')
    redirect(`/wallet?credited=${result.coins}`)
  } catch (error) {
    // redirect() works by throwing, so it must be allowed through.
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error
    if (typeof error === 'object' && error !== null && 'digest' in error) throw error
    redirect('/wallet?problem=verify')
  }
}
