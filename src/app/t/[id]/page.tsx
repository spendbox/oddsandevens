import type { Metadata } from 'next'
import TeamDoor from '@/components/team-door'
import { publicSupabase } from '@/lib/supabase-server'

/**
 * The page a team's link opens.
 *
 * ## What it is, and the thing it is careful not to be
 *
 * It is a sign-in page that knows which team you are signing in for. It is
 * not a way into the team: being added by an admin, by email address, is
 * still the only thing that makes somebody a member. A link that goes
 * astray gets whoever has it exactly as far as a sign-in form — which is
 * why the only thing the server will tell this page is the team's name.
 *
 * That is also why the name comes from `team_name()`, a function that
 * returns one column and nothing else, rather than from a select the
 * policies would have to be widened for.
 */
export const dynamic = 'force-dynamic'

async function nameOf(id: string): Promise<string | null> {
  const db = publicSupabase()
  if (!db) return null
  // An id that is not a uuid cannot match anything, and sending it to
  // Postgres makes it error rather than return nothing.
  if (!/^[0-9a-f-]{32,36}$/i.test(id)) return null
  try {
    const { data, error } = await db.rpc('team_name', { team: id })
    if (error) return null
    const name = typeof data === 'string' ? data.trim() : ''
    return name || null
  } catch {
    return null
  }
}

export async function generateMetadata(props: PageProps<'/t/[id]'>): Promise<Metadata> {
  const { id } = await props.params
  const name = await nameOf(id)
  return {
    title: name ? `Join ${name}` : 'A team on Pad',
    description: 'Sign in to Pad to see your team.',
    // An invitation is not something to leave in a search index.
    robots: { index: false, follow: false },
  }
}

export default async function TeamPage(props: PageProps<'/t/[id]'>) {
  const { id } = await props.params
  const name = await nameOf(id)
  return <TeamDoor teamId={id} name={name} />
}
