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
  pendingIds,
  pendingProjectIds,
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

    // Projects are pulled after documents and never fail the sync: an
    // un-migrated database should cost the user their grouping, not their
    // documents.
    const { data: projectData, error: projectError } = await db
      .from('projects')
      .select('*')
      .eq('user_id', userId)
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
