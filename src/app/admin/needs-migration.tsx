import { Database } from 'lucide-react'
import { Card, Problem } from '@/components/ui'

/**
 * Why a count is not on screen.
 *
 * There are two reasons and they need different sentences. A database that has
 * not had the migration applied is not broken — it is one SQL file behind, and
 * the only useful thing to say is which file and where to run it. Anything else
 * is a real failure and the message from Postgres is worth more than a guess at
 * what it meant.
 *
 * What is never shown in either case is a number. A total counted over a table
 * that could not be read is an invention, and an admin acting on it is worse
 * off than one looking at a blank.
 */
export function InsightProblem({
  what,
  file,
  needsMigration,
  problem,
}: {
  /** What could not be counted, as it would read mid-sentence. */
  what: string
  file: string
  needsMigration: boolean
  problem: string
}) {
  if (!needsMigration) {
    return <Problem>Could not work out {what}: {problem}</Problem>
  }

  return (
    <Card className="border-gold/25 bg-gold/6">
      <p className="flex items-center gap-2 text-sm font-semibold text-gold">
        <Database size={16} /> One migration behind
      </p>
      <p className="mt-2 text-sm leading-relaxed text-mist">
        This database cannot work out {what} yet. In Supabase → SQL Editor, run{' '}
        <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-cyan">
          supabase/migrations/{file}
        </code>{' '}
        and reload this page.
      </p>
      <p className="mt-2 text-xs text-dusk">
        It only adds ways of counting what is already there. It writes nothing, changes no
        money and is safe to run twice. If you have just run it and still see this, give
        Supabase a few seconds to notice the new functions and reload again.
      </p>
    </Card>
  )
}
