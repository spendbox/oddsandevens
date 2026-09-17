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

import {
  acceptFromServer,
  acceptProjectFromServer,
  allDocsRaw,
  allProjectsRaw,
  clearPending,
  clearPendingProject,
  loadDoc,
  loadProject,
  loadMeta,
  pendingIds,
  pendingProjectIds,
  saveMeta,
} from './store.ts'
import { getSupabase } from './supabase.ts'
import type { Doc, Project } from './types'

/** A document as the `docs` table stores it. */
interface Row {
  id: string
  user_id: string
  title: string
  blocks: unknown
  created_at: number
  updated_at: number
  deleted_at: number | null
  project_id: string | null
  favorited_at: number | null
  /** The document's Brain rules. See lib/rules.ts. */
  rules: unknown
  ignore_rules: boolean
  /** What it is for, in the writer's own words. See lib/goals.ts. */
  goals: unknown
}

interface ProjectRow {
  id: string
  user_id: string
  name: string
  collapsed: boolean
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
    ...(row.project_id ? { projectId: row.project_id } : {}),
    // Absent rather than empty, so a document that has never been given rules
    // or goals is stored here exactly as one written before either existed.
    ...(Array.isArray(row.rules) && row.rules.length ? { rules: row.rules as Doc['rules'] } : {}),
    ...(row.ignore_rules ? { ignoreRules: true } : {}),
    ...(Array.isArray(row.goals) && row.goals.length
      ? { goals: (row.goals as unknown[]).filter((goal): goal is string => typeof goal === 'string') }
      : {}),
    ...(row.favorited_at ? { favoritedAt: Number(row.favorited_at) } : {}),
    ...(row.deleted_at ? { deletedAt: Number(row.deleted_at) } : {}),
  }
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: String(row.name ?? ''),
    createdAt: Number(row.created_at) || Date.now(),
    updatedAt: Number(row.updated_at) || Date.now(),
    ...(row.collapsed ? { collapsed: true } : {}),
    ...(row.deleted_at ? { deletedAt: Number(row.deleted_at) } : {}),
  }
}

function toProjectRow(project: Project, userId: string): ProjectRow {
  return {
    id: project.id,
    user_id: userId,
    name: project.name,
    collapsed: !!project.collapsed,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
    deleted_at: project.deletedAt ?? null,
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
    project_id: doc.projectId ?? null,
    favorited_at: doc.favoritedAt ?? null,
    rules: doc.rules ?? null,
    ignore_rules: !!doc.ignoreRules,
    goals: doc.goals ?? null,
    deleted_at: doc.deletedAt ?? null,
  }
}

/**
 * Fetching only what changed.
 *
 * The pull used to ask for every row every twenty seconds. With a few
 * documents that is invisible; with five hundred it is megabytes over a phone
 * connection, three times a minute, to learn that nothing happened. So each
 * table keeps a cursor — the newest `updatedAt` this device has accepted — and
 * asks only for rows past it.
 *
 * Two things stop a cursor from silently losing a row. It reaches back a
 * minute beyond itself, because `updatedAt` is written by whichever device
 * made the edit and two devices' clocks disagree; and every so often it is
 * ignored altogether for a full reconcile, which repairs anything the overlap
 * was too narrow to catch. Both cost a little bandwidth to buy back
 * correctness, which is the right way round for a copy of somebody's work.
 */
export interface Cursor {
  /** The newest updatedAt accepted from the server. */
  at: number
  /** When everything was last fetched regardless of the cursor. */
  fullAt: number
}

/** How far back a pull reaches beyond the newest thing it has seen. */
export const OVERLAP_MS = 60_000
/** How often a pull ignores the cursor and reconciles the whole table. */
export const FULL_EVERY_MS = 30 * 60_000

/** The timestamp to fetch past, or null for everything. */
export function pullSince(cursor: Cursor | null, now: number): number | null {
  if (!cursor || !cursor.at) return null
  if (now - cursor.fullAt >= FULL_EVERY_MS) return null
  return Math.max(0, cursor.at - OVERLAP_MS)
}

/**
 * Where the cursor stands after a pull.
 *
 * It only ever moves forward, and only to something actually seen. Moving it
 * to "now" would skip a row written a second ago by a device whose clock is
 * behind — the row would be newer than the cursor by its own timestamp and
 * never fetched again.
 */
export function advanceCursor(
  cursor: Cursor | null,
  seen: number[],
  now: number,
  wasFull: boolean,
): Cursor {
  let highest = cursor?.at ?? 0
  for (const at of seen) if (at > highest) highest = at
  return { at: highest, fullAt: wasFull ? now : (cursor?.fullAt ?? now) }
}

/** One cursor per table per account, so two accounts cannot share a position. */
function cursorKey(table: 'docs' | 'projects', userId: string): string {
  return `cursor:${table}:${userId}`
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

    // Projects push before documents, so a document that names a new project
    // never arrives at a device that has not heard of it yet.
    const projectIds = await pendingProjectIds()
    if (projectIds.length) {
      const projects = (await Promise.all(projectIds.map(loadProject))).filter(
        (p): p is Project => p !== null,
      )
      if (projects.length) {
        const { error } = await db
          .from('projects')
          .upsert(projects.map((p) => toProjectRow(p, userId)))
        // A missing `projects` table means migration 0003 has not been run.
        // That must not stop documents syncing, so it is not fatal here.
        if (!error) await Promise.all(projects.map((p) => clearPendingProject(p.id)))
      }
    }

    const now = Date.now()
    const docCursor = await loadMeta<Cursor>(cursorKey('docs', userId))
    const docsSince = pullSince(docCursor, now)

    let docQuery = db.from('docs').select('*').eq('user_id', userId)
    if (docsSince !== null) docQuery = docQuery.gt('updated_at', docsSince)
    const { data, error } = await docQuery
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
    // Written only after every row has been stored: a cursor moved past a row
    // that was never written is a row this device will never ask for again.
    await saveMeta(
      cursorKey('docs', userId),
      advanceCursor(docCursor, (data as Row[]).map((row) => Number(row.updated_at) || 0), now, docsSince === null),
    )

    // Projects are pulled after documents and never fail the sync: an
    // un-migrated database should cost the user their grouping, not their
    // documents.
    const projectCursor = await loadMeta<Cursor>(cursorKey('projects', userId))
    const projectsSince = pullSince(projectCursor, now)
    let projectQuery = db.from('projects').select('*').eq('user_id', userId)
    if (projectsSince !== null) projectQuery = projectQuery.gt('updated_at', projectsSince)
    const { data: projectData, error: projectError } = await projectQuery
    if (!projectError && projectData) {
      const mineById = new Map((await allProjectsRaw()).map((p) => [p.id, p]))
      for (const row of projectData as ProjectRow[]) {
        const incoming = toProject(row)
        const existing = mineById.get(incoming.id)
        if (!existing || incoming.updatedAt > existing.updatedAt) {
          await acceptProjectFromServer(incoming)
          changed = true
        }
      }
      await saveMeta(
        cursorKey('projects', userId),
        advanceCursor(
          projectCursor,
          (projectData as ProjectRow[]).map((row) => Number(row.updated_at) || 0),
          now,
          projectsSince === null,
        ),
      )
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
    // Projects first, for the same reason as in runSync.
    const projects = await allProjectsRaw()
    if (projects.length) {
      const { error } = await db
        .from('projects')
        .upsert(projects.map((p) => toProjectRow(p, userId)))
      if (!error) await Promise.all(projects.map((p) => clearPendingProject(p.id)))
    }

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
