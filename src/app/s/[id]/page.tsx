import type { Metadata } from 'next'
import Link from 'next/link'
import ReadOnlyDoc from '@/components/read-only-doc'
import { publicSupabase } from '@/lib/supabase-server'
import type { Block } from '@/lib/types'

/**
 * A shared document, readable by anyone with the link.
 *
 * Rendered fresh on each request rather than cached: the owner republishing
 * should change what the link shows, and a stale snapshot is worse than a
 * slightly slower page.
 */
export const dynamic = 'force-dynamic'

interface Shared {
  title: string
  blocks: Block[]
  updated_at: number
  /** Whether it is also in the World, which decides what this page says. */
  listed: boolean
}

function shape(data: {
  title?: unknown
  blocks?: unknown
  updated_at?: unknown
  listed?: unknown
}): Shared {
  return {
    title: String(data.title ?? ''),
    blocks: Array.isArray(data.blocks) ? (data.blocks as Block[]) : [],
    updated_at: Number(data.updated_at) || 0,
    listed: !!data.listed,
  }
}

/**
 * One shared note, by the id in its link.
 *
 * Through `shared_doc()` rather than a select, because reading `shared_docs`
 * directly is now limited to what is listed in the World — see
 * 0005_world.sql, which closed the hole where one unfiltered query returned
 * every link-shared note in the table. The function takes the id, which is
 * the same secret the link always was, and can return that row and no other.
 *
 * The plain select is still tried if the function is not there, so a database
 * that has run 0002 and not 0005 goes on serving the links it already gave
 * out. A missing migration must not break somebody else's link.
 */
async function fetchShared(id: string): Promise<Shared | null> {
  const db = publicSupabase()
  if (!db) return null
  // An id that is not a uuid cannot match anything, and sending it to Postgres
  // makes it error rather than return nothing.
  if (!/^[0-9a-f-]{32,36}$/i.test(id)) return null
  try {
    const { data, error } = await db.rpc('shared_doc', { share_id: id })
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data
      return row ? shape(row) : null
    }
    const fallback = await db
      .from('shared_docs')
      .select('title, blocks, updated_at')
      .eq('id', id)
      .maybeSingle()
    if (fallback.error || !fallback.data) return null
    return shape(fallback.data)
  } catch {
    return null
  }
}

export async function generateMetadata(
  props: PageProps<'/s/[id]'>,
): Promise<Metadata> {
  const { id } = await props.params
  const shared = await fetchShared(id)
  const title = shared?.title?.trim() || 'Shared note'
  return {
    title,
    description: 'Shared from Pad.',
    /*
      A link share should not end up in search results: whoever published it
      chose to send it to particular people, not to the whole web. A note
      listed in the World is the opposite decision, said in as many words, so
      that one may be indexed.
    */
    robots: shared?.listed ? { index: true, follow: true } : { index: false, follow: false },
  }
}

export default async function SharedPage(props: PageProps<'/s/[id]'>) {
  const { id } = await props.params
  const shared = await fetchShared(id)

  return (
    <div className="min-h-dvh">
      <header className="flex items-center gap-2 border-b border-[var(--color-line)] px-4 py-2.5">
        <Link href="/" className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-[var(--color-accent)] text-[10px] font-bold text-white">
            I
          </span>
          <span className="text-xs font-semibold">Pad</span>
        </Link>
        <span className="ml-auto text-[11px] text-[var(--color-faint)]">Shared, read only</span>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        {shared ? (
          <>
            <ReadOnlyDoc title={shared.title} blocks={shared.blocks} />
            <footer className="mt-12 border-t border-[var(--color-line)] pt-4 text-[11px] text-[var(--color-faint)]">
              {shared.updated_at > 0 && (
                <span>Shared {new Date(shared.updated_at).toLocaleDateString()}. </span>
              )}
              <Link href="/" className="underline">
                Make your own
              </Link>
            </footer>
          </>
        ) : (
          <div className="py-16 text-center">
            <h1 className="text-lg font-semibold">This link does not lead anywhere</h1>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              The document may have been unshared, or the link may be incomplete.
            </p>
            <Link
              href="/"
              className="mt-5 inline-block rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white"
            >
              Open Pad
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
