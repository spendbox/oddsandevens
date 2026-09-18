'use client'

import { docOpening } from './blocks.ts'
import { blocksToText } from './export.ts'
import { newId } from './id.ts'
import { getSupabase } from './supabase.ts'
import type { Doc } from './types'

/**
 * Publishing a note, to a link and — if it is said in as many words — to the
 * World.
 *
 * What is published is a snapshot, not a live view: the owner decides when the
 * link's contents change, and the private `docs` table keeps its "only your
 * own" policy untouched. See supabase/migrations/0002_shared_docs.sql.
 *
 * ## A link and a listing are two different acts
 *
 * A link is sent to particular people. A listing is left where anybody can
 * find it. They are one row apart in the database and a long way apart in
 * what somebody means by them, so `listed` is never implied: publishing
 * without saying so leaves a note exactly as private as it was, and turning
 * the listing off later leaves the link working for the people who have it.
 *
 * ## Why the plain text goes up with it
 *
 * Only for a listed note, and only so the World can be searched. A note's
 * blocks are jsonb and searching inside them means parsing every one of them
 * on every query; the same words as plain text are something Postgres can
 * index once. The opening two lines travel as their own field for the same
 * kind of reason: browsing should not download twenty whole notes to show two
 * lines of each.
 */

export interface ShareResult {
  ok: boolean
  url?: string
  /** Whether the shared copy is listed in the World. */
  listed?: boolean
  /** A sentence to show the person, when something stopped it. */
  problem?: string
}

/** What is known about a note's shared copy, if it has one. */
export interface ShareState {
  url: string | null
  listed: boolean
}

export interface PublishOptions {
  /** Put it in the World, where anyone can find it. Never assumed. */
  listed?: boolean
  /** What to credit it to. The name they call themselves in the app. */
  author?: string
}

/**
 * A sentence for a database that has not been brought up to date.
 *
 * By far the commonest cause of a failure here, and the one thing the person
 * in front of it can do nothing about — so it says which file to run rather
 * than repeating Postgres at them.
 */
function explain(message: string): string {
  if (/listed|author|body|preview|search/i.test(message)) {
    return 'Sharing to the World needs migration 0005_world.sql to be run on your database.'
  }
  if (/relation|does not exist|schema/i.test(message)) {
    return 'Sharing needs migration 0002_shared_docs.sql to be run on your database.'
  }
  return `Could not publish: ${message}`
}

export async function publishDoc(
  doc: Doc,
  ownerId: string,
  options: PublishOptions = {},
): Promise<ShareResult> {
  const db = await getSupabase()
  if (!db) {
    return {
      ok: false,
      problem: 'Sharing needs an account, which is not set up on this copy of Pad.',
    }
  }

  const listed = !!options.listed

  try {
    // Re-publishing keeps the same link. Somebody may already have it.
    const { data: existing } = await db
      .from('shared_docs')
      .select('id')
      .eq('doc_id', doc.id)
      .eq('owner', ownerId)
      .maybeSingle()

    const id = existing?.id ?? newId()
    const now = Date.now()
    const { error } = await db.from('shared_docs').upsert(
      {
        id,
        doc_id: doc.id,
        owner: ownerId,
        title: doc.title,
        blocks: doc.blocks,
        listed,
        author: (options.author ?? '').trim().slice(0, 40),
        /*
          The words, for search and for the two lines in the list — and only
          for a note that is going where it can be searched. An unlisted link
          share has no use for either, so it does not carry them.
        */
        body: listed ? blocksToText(doc.blocks).slice(0, 20_000) : '',
        preview: listed ? docOpening(doc, 200) : '',
        created_at: now,
        updated_at: now,
      },
      { onConflict: 'doc_id,owner' },
    )

    if (error) return { ok: false, problem: explain(error.message) }

    return { ok: true, url: `${window.location.origin}/s/${id}`, listed }
  } catch {
    return { ok: false, problem: 'Could not reach the server. Your work is still saved here.' }
  }
}

export async function unpublishDoc(docId: string, ownerId: string): Promise<boolean> {
  const db = await getSupabase()
  if (!db) return false
  try {
    const { error } = await db
      .from('shared_docs')
      .delete()
      .eq('doc_id', docId)
      .eq('owner', ownerId)
    return !error
  } catch {
    return false
  }
}

/**
 * The shared copy of a note, if it has one: the link, and whether it is in
 * the World.
 *
 * `listed` reads as false on a database that has not run 0005 yet, which is
 * the right answer there: nothing is in the World, because there is no World.
 */
export async function shareState(docId: string, ownerId: string): Promise<ShareState> {
  const db = await getSupabase()
  if (!db) return { url: null, listed: false }
  try {
    const { data } = await db
      .from('shared_docs')
      .select('id, listed')
      .eq('doc_id', docId)
      .eq('owner', ownerId)
      .maybeSingle()
    if (!data?.id) return { url: null, listed: false }
    return { url: `${window.location.origin}/s/${data.id}`, listed: !!data.listed }
  } catch {
    return { url: null, listed: false }
  }
}
