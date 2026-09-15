'use client'

import { newId } from './id.ts'
import { getSupabase } from './supabase.ts'
import type { Block, Doc } from './types'

/**
 * Publishing a document to a public link.
 *
 * What is published is a snapshot, not a live view: the owner decides when the
 * link's contents change, and the private `docs` table keeps its "only your
 * own" policy untouched. See supabase/migrations/0002_shared_docs.sql.
 */

export interface ShareResult {
  ok: boolean
  url?: string
  /** A sentence to show the person, when something stopped it. */
  problem?: string
}

/**
 * Attachments are stripped before publishing.
 *
 * Their bytes only exist in the owner's browser, so a visitor could never
 * download them. Publishing the block anyway would show a reader a file they
 * cannot open and cannot be told why.
 */
function forSharing(blocks: Block[]): Block[] {
  return blocks.map((block) =>
    block.type === 'file' ? { ...block, ref: '', size: 0, mime: '' } : block,
  )
}

export async function publishDoc(doc: Doc, ownerId: string): Promise<ShareResult> {
  const db = await getSupabase()
  if (!db) {
    return {
      ok: false,
      problem: 'Sharing needs an account, which is not set up on this copy of Pad.',
    }
  }

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
        blocks: forSharing(doc.blocks),
        created_at: now,
        updated_at: now,
      },
      { onConflict: 'doc_id,owner' },
    )

    if (error) {
      // The commonest cause by far is the migration not having been run.
      return {
        ok: false,
        problem: /relation|does not exist|schema/i.test(error.message)
          ? 'Sharing needs migration 0002_shared_docs.sql to be run on your database.'
          : `Could not publish: ${error.message}`,
      }
    }

    return { ok: true, url: `${window.location.origin}/s/${id}` }
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

/** The existing link for a document, or null if it was never shared. */
export async function existingShare(docId: string, ownerId: string): Promise<string | null> {
  const db = await getSupabase()
  if (!db) return null
  try {
    const { data } = await db
      .from('shared_docs')
      .select('id')
      .eq('doc_id', docId)
      .eq('owner', ownerId)
      .maybeSingle()
    return data?.id ? `${window.location.origin}/s/${data.id}` : null
  } catch {
    return null
  }
}
