import 'server-only'
import { supabaseAdmin } from './supabase/admin'

/** One day, and how many people tried the box on it. */
export type DayCount = { day: string; count: number }

/**
 * Attempts per day on a box, for the last `days` days.
 *
 * Every day in the window is returned, including the empty ones. A chart that
 * silently skips quiet days squeezes the busy ones together and makes a slow
 * week look like a steady one.
 */
export async function attemptsByDay(boxId: string, days = 14): Promise<DayCount[]> {
  const admin = supabaseAdmin()

  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  start.setUTCDate(start.getUTCDate() - (days - 1))

  const { data } = await admin
    .from('attempts')
    .select('created_at')
    .eq('box_id', boxId)
    .gte('created_at', start.toISOString())

  const counts = new Map<string, number>()
  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(start)
    day.setUTCDate(start.getUTCDate() + offset)
    counts.set(day.toISOString().slice(0, 10), 0)
  }

  for (const row of data ?? []) {
    const key = String(row.created_at).slice(0, 10)
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from(counts, ([day, count]) => ({ day, count }))
}
