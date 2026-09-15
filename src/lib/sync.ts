'use client'

/**
 * Sync between the device and Supabase.
 *
 * The device is the source of truth for anything typed on it; the server is a
 * copy that lets a second device catch up. So this never blocks an edit, never
 * reports an error into the editing surface, and is free to fail — the work is
 * already safe in IndexedDB before sync hears about it.
 *
 * Conflicts are resolved last-write-wins per document, on updatedAt. That is
 * the honest limit of this design and worth naming: two devices editing the
 * same document while both offline will keep the later one. Per-block merging
 * would need real CRDTs, which is a much larger piece of machinery than the
 * problem has so far earned.
 */

import { acceptFromServer, allDocsRaw, clearPending, loadDoc, pendingIds } from './store.ts'
import { getSupabase } from './supabase.ts'
import type { Doc } from './types'

/** A document as the `docs` table stores it. */
interface Row {
  id: string
  user_id: string
  title: string
  blocks: unknown
  created_at: number
  updated_at: number
  deleted_at: number | null
}

function toDoc(row: Row): Doc {
  return {
    id: row.id,
    title: row.title,
    blocks: Array.isArray(row.blocks) ? (row.blocks as Doc['blocks']) : [],
    createdAt: Number(row.created_at) || Date.now(),
    updatedAt: Number(row.updated_at) || Date.now(),
    ...(row.deleted_at ? { deletedAt: Number(row.deleted_at) } : {}),
  }
}

function toRow(doc: Doc, userId: string): Row {
  return {
    id: doc.id,
    user_id: userId,
    title: doc.title,
    blocks: doc.blocks,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
    deleted_at: doc.deletedAt ?? null,
  }
}

export type SyncState = 'off' | 'idle' | 'syncing' | 'error'

/**
 * Pushes everything waiting in the outbox, then pulls anything newer from the
 * server. Returns true if any local document changed, so the caller knows
 * whether it needs to re-read.
 */
export async function runSync(userId: string): Promise<{ ok: boolean; changed: boolean }> {
  const db = await getSupabase()
  if (!db) return { ok: false, changed: false }

  try {
    // Push first. A document typed here while offline should reach the server
    // before we pull, or the pull could hand back an older copy and the merge
    // below would discard work that has never been anywhere else.
    const ids = await pendingIds()
    if (ids.length) {
      const docs = (await Promise.all(ids.map(loadDoc))).filter((d): d is Doc => d !== null)
      if (docs.length) {
        const { error } = await db.from('docs').upsert(docs.map((d) => toRow(d, userId)))
        if (error) return { ok: false, changed: false }
        await Promise.all(docs.map((d) => clearPending(d.id)))
      }
    }

    const { data, error } = await db.from('docs').select('*').eq('user_id', userId)
    if (error || !data) return { ok: false, changed: false }

    const local = new Map((await allDocsRaw()).map((d) => [d.id, d]))
    let changed = false
    for (const row of data as Row[]) {
      const incoming = toDoc(row)
      const mine = local.get(incoming.id)
      if (!mine || incoming.updatedAt > mine.updatedAt) {
        await acceptFromServer(incoming)
        changed = true
      }
    }
    return { ok: true, changed }
  } catch {
    // Offline, DNS failure, a table that has not been migrated yet — none of
    // these are the user's problem mid-sentence.
    return { ok: false, changed: false }
  }
}

/** Uploads every local document. Used once, right after a first sign-in. */
export async function pushAll(userId: string): Promise<boolean> {
  const db = await getSupabase()
  if (!db) return false
  try {
    const docs = await allDocsRaw()
    if (!docs.length) return true
    const { error } = await db.from('docs').upsert(docs.map((d) => toRow(d, userId)))
    if (error) return false
    await Promise.all(docs.map((d) => clearPending(d.id)))
    return true
  } catch {
    return false
  }
}
