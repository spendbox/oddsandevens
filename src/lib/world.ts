'use client'

import { readBlocks, type Block } from './types.ts'
import { getSupabase } from './supabase.ts'

/**
 * The World: the notes people have chosen to leave where anybody can read
 * them.
 *
 * ## What this is, and what it is careful not to be
 *
 * It is a second list, made of other people's notes, and nothing about it
 * touches the first. Nothing here writes to your notes; saving one makes a
 * fresh note of your own from a copy of the words, and from that moment it is
 * yours — the original can be taken down without your copy going with it.
 *
 * ## Why the reading is all done by the server
 *
 * Search inside your own notes is a local index, because they are yours and
 * they are already on the device. The World is the opposite case: it is
 * everybody's, it is unbounded, and downloading it to search it is the one
 * thing that could not be made fast. So the query goes to Postgres, which has
 * a generated tsvector and a GIN index over it (see 0005_world.sql), and what
 * comes back is a page of twenty rows carrying two lines each.
 *
 * ## Why every failure here is quiet
 *
 * The same bargain the rest of this app makes: a World that cannot be reached
 * is a tab that says so, never an error in front of somebody's writing. No
 * account, no key, no migration, no network — each of them has a sentence,
 * and none of them stops a single thing on the notes screen working.
 */

/** How many rows one page of the World is. */
export const WORLD_PAGE = 20

export interface WorldNote {
  /** The share's id, which is also its public address at /s/<id>. */
  id: string
  title: string
  /** The opening of it, two lines' worth, stored as its own column. */
  preview: string
  /** What the sharer calls themselves, or empty if they never said. */
  author: string
  updatedAt: number
}

export interface WorldStats {
  notes: number
  people: number
}

/**
 * What one person has put into the World, and what came of it.
 *
 * Two numbers, on their own dashboard: how many of their notes are out there,
 * and how many times somebody kept a copy. Not views, not likes, not
 * followers — a save is somebody deciding the note was worth having, which is
 * the whole of what this is for.
 */
export interface MyWorld {
  /** How many of their notes are listed. */
  shared: number
  /** How many copies other people have taken of them, added up. */
  saves: number
}

export interface WorldFeed {
  notes: WorldNote[]
  /** Whether there is another page behind this one. */
  more: boolean
  /** A sentence to show instead of the list, when there is no list. */
  problem?: string
}

const OFFLINE = 'The World needs an account, which is not set up on this copy of Pad.'

/** What a row of the listing looks like coming back. */
interface FeedRow {
  id: string
  title: string | null
  preview: string | null
  author: string | null
  updated_at: number | null
}

function toWorldNote(row: FeedRow): WorldNote {
  return {
    id: String(row.id),
    title: String(row.title ?? '').trim(),
    preview: String(row.preview ?? '').trim(),
    author: String(row.author ?? '').trim(),
    updatedAt: Number(row.updated_at) || 0,
  }
}

/**
 * A page of the World, newest first, filtered by a search if there is one.
 *
 * The search is Postgres' own `websearch_to_tsquery`, which is the syntax
 * people already type into search boxes: quoted phrases, `or`, a leading
 * minus to exclude. It is matched against the same 'simple' configuration the
 * stored column was generated with — a mismatch there silently matches
 * nothing, which is the kind of bug that looks like an empty database.
 *
 * One row past the page is asked for and thrown away. That is how `more` is
 * known without a second round trip counting everything.
 */
export async function worldFeed(options: {
  query?: string
  offset?: number
}): Promise<WorldFeed> {
  const db = await getSupabase()
  if (!db) return { notes: [], more: false, problem: OFFLINE }

  const offset = Math.max(0, options.offset ?? 0)
  const query = (options.query ?? '').trim()

  try {
    let request = db
      .from('shared_docs')
      .select('id, title, preview, author, updated_at')
      .eq('listed', true)
      .order('updated_at', { ascending: false })
      .range(offset, offset + WORLD_PAGE)

    if (query) {
      request = request.textSearch('search', query, { type: 'websearch', config: 'simple' })
    }

    const { data, error } = await request
    if (error) {
      return {
        notes: [],
        more: false,
        problem: /listed|search|column/i.test(error.message)
          ? 'The World needs migration 0005_world.sql to be run on your database.'
          : 'Could not reach the World. Everything of yours is here as usual.',
      }
    }

    const rows = (data ?? []) as FeedRow[]
    return { notes: rows.slice(0, WORLD_PAGE).map(toWorldNote), more: rows.length > WORLD_PAGE }
  } catch {
    return {
      notes: [],
      more: false,
      problem: 'Could not reach the World. Everything of yours is here as usual.',
    }
  }
}

/**
 * How many notes are out there, and how many people put them there.
 *
 * A count rather than a list, because the question somebody has when they
 * open a tab like this for the first time is whether anybody else is in it.
 * Null when it cannot be answered, which prints nothing rather than a zero
 * that would be a lie.
 */
export async function worldStats(): Promise<WorldStats | null> {
  const db = await getSupabase()
  if (!db) return null
  try {
    const { data, error } = await db.rpc('world_stats')
    if (error) return null
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return null
    return { notes: Number(row.notes) || 0, people: Number(row.people) || 0 }
  } catch {
    return null
  }
}

/**
 * What this account has in the World.
 *
 * Their own rows, which the read policy lets them see whether or not they are
 * listed — so this counts the listed ones here rather than asking the server
 * for two aggregates. Null when it cannot be answered, which prints nothing
 * rather than a zero that would be a lie.
 */
export async function myWorld(ownerId: string): Promise<MyWorld | null> {
  const db = await getSupabase()
  if (!db) return null
  try {
    const { data, error } = await db
      .from('shared_docs')
      .select('listed, saves')
      .eq('owner', ownerId)
    if (error || !data) return null
    const mine = data as Array<{ listed?: boolean; saves?: number }>
    const listed = mine.filter((row) => row.listed)
    return {
      shared: listed.length,
      saves: listed.reduce((total, row) => total + (Number(row.saves) || 0), 0),
    }
  } catch {
    return null
  }
}

/**
 * Says that somebody kept a copy.
 *
 * Fire and forget, and deliberately not awaited by anything the reader is
 * waiting on: the note is already in their notes by the time this is called,
 * and a counter failing to go up must never look like a save that did not
 * happen.
 */
export async function markSaved(id: string): Promise<void> {
  const db = await getSupabase()
  if (!db) return
  try {
    await db.rpc('world_saved', { share_id: id })
  } catch {
    // A database without 0006 yet, or no network. Neither is worth a word to
    // the person who has just saved a note successfully.
  }
}

/**
 * The whole of one shared note, fetched only when somebody saves it.
 *
 * The listing carries two lines of each note and nothing more; the blocks are
 * asked for at the moment they are about to become a note of somebody's own.
 * Everything read here goes through `readBlocks`, because a value that has
 * been to a server and back — and was written by somebody else — is not ours.
 */
export async function worldNote(id: string): Promise<{ title: string; blocks: Block[] } | null> {
  const db = await getSupabase()
  if (!db) return null
  try {
    const { data, error } = await db
      .from('shared_docs')
      .select('title, blocks')
      .eq('id', id)
      .eq('listed', true)
      .maybeSingle()
    if (error || !data) return null
    return { title: String(data.title ?? '').trim(), blocks: readBlocks(data.blocks) }
  } catch {
    return null
  }
}
