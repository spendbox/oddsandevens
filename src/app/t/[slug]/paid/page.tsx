import Link from 'next/link'
import { redirect } from 'next/navigation'
import { confirmPurchase } from '../purchase'

export const metadata = { title: 'Payment' }

/** Where Paystack sends the buyer back to. The payment is checked here, with Paystack. */
export default async function PaidPage(props: PageProps<'/t/[slug]/paid'>) {
  const [{ slug }, params] = await Promise.all([props.params, props.searchParams])
  const reference = typeof params.reference === 'string' ? params.reference : ''

  if (reference) {
    const paid = await confirmPurchase(reference, slug)
    if (paid) redirect(`/t/${slug}`)
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold text-ink">We could not confirm that payment</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
          If the money left your account, it will show up here shortly — open the tool again in a
          minute. Nothing was charged twice.
        </p>
        <Link href={`/t/${slug}`} className="btn btn-primary mt-5">
          Back to the tool
        </Link>
      </div>
    </main>
  )
}
