import { newId } from './id.ts'
import { blockText, type Doc, type Project } from './types.ts'

/**
 * Grouping documents into projects.
 *
 * Everything here is a pure function over arrays, with no storage and no React,
 * so the rules that are easy to get quietly wrong — what a merged project is
 * called, what counts as a match, what happens to the last document in a
 * project — can be tested directly instead of clicked through.
 */

export function makeProject(name: string): Project {
  const now = Date.now()
  return { id: newId(), name: name.trim() || 'New project', createdAt: now, updatedAt: now }
}

/**
 * The name for a project made by dropping one document onto another.
 *
 * The document being dropped *onto* names it: that is the one already sitting
 * where the new group will be, so its title is the label the user is looking at
 * when the group appears. An untitled document names nothing, so it falls
 * through to the other one, and then to a placeholder the user can rename.
 */
export function mergedProjectName(target: Doc, dragged: Doc): string {
  const candidate = target.title.trim() || dragged.title.trim()
  return candidate || 'New project'
}

export interface GroupedDocs {
  /** Projects with their documents, newest-touched project first. */
  projects: Array<{ project: Project; docs: Doc[] }>
  /** Documents belonging to no project. */
  loose: Doc[]
}

/**
 * Arranges documents under their projects.
 *
 * A document naming a project that no longer exists is treated as loose rather
 * than hidden. A dangling id is recoverable — the document is still in the
 * list — whereas filtering it out would make a document vanish because of a
 * sync ordering accident.
 */
export function groupDocs(docs: Doc[], projects: Project[]): GroupedDocs {
  const live = projects.filter((p) => !p.deletedAt)
  const buckets = new Map<string, Doc[]>(live.map((p) => [p.id, []]))
  const loose: Doc[] = []

  for (const doc of docs) {
    if (doc.deletedAt) continue
    const bucket = doc.projectId ? buckets.get(doc.projectId) : undefined
    if (bucket) bucket.push(doc)
    else loose.push(doc)
  }

  const grouped = live
    .map((project) => ({ project, docs: buckets.get(project.id) ?? [] }))
    // A project whose documents were all deleted or moved out still shows, so
    // it can be renamed or removed rather than becoming invisible clutter.
    .sort((a, b) => {
      const aLatest = a.docs[0]?.updatedAt ?? a.project.updatedAt
      const bLatest = b.docs[0]?.updatedAt ?? b.project.updatedAt
      return bLatest - aLatest
    })

  return { projects: grouped, loose }
}

/** The documents in one project, in the order the sidebar shows them. */
export function docsInProject(docs: Doc[], projectId: string): Doc[] {
  return docs.filter((doc) => !doc.deletedAt && doc.projectId === projectId)
}

/**
 * Searches a set of documents by title and by content.
 *
 * Title matches rank above content matches, because someone typing a name is
 * looking for that document, not for the others that happen to mention it.
 */
export function searchDocs(docs: Doc[], query: string): Doc[] {
  const q = query.trim().toLowerCase()
  if (!q) return docs

  const scored: Array<{ doc: Doc; rank: number }> = []
  for (const doc of docs) {
    const title = doc.title.trim().toLowerCase()
    if (title === q) scored.push({ doc, rank: 3 })
    else if (title.startsWith(q)) scored.push({ doc, rank: 2 })
    else if (title.includes(q)) scored.push({ doc, rank: 1 })
    else if (doc.blocks.some((b) => blockText(b).toLowerCase().includes(q))) {
      scored.push({ doc, rank: 0 })
    }
  }
  // Stable within a rank, so equal matches keep their recency order.
  return scored.sort((a, b) => b.rank - a.rank).map((entry) => entry.doc)
}

/**
 * Whether a project should be removed once a document leaves it.
 *
 * A project of one document is not a project — it is a document with an extra
 * click in front of it. Dissolving it automatically means dragging the second
 * document out undoes the merge, which is what someone expects from an action
 * they created by dragging two things together.
 */
export function shouldDissolve(remaining: number): boolean {
  return remaining <= 1
}
