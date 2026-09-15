import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeBlock } from '../blocks.ts'
import {
  docsInProject,
  groupDocs,
  makeProject,
  mergedProjectName,
  searchDocs,
  shouldDissolve,
} from '../projects.ts'
import type { Doc, Project } from '../types.ts'

function doc(id: string, title: string, extra: Partial<Doc> = {}): Doc {
  return { id, title, blocks: [], createdAt: 0, updatedAt: 0, ...extra }
}

function withText(id: string, title: string, body: string, extra: Partial<Doc> = {}): Doc {
  const block = makeBlock('text')
  if (block.type === 'text') block.text = body
  return { ...doc(id, title, extra), blocks: [block] }
}

test('a project gets a name, or a placeholder', () => {
  assert.equal(makeProject('Launch').name, 'Launch')
  assert.equal(makeProject('   ').name, 'New project')
  assert.notEqual(makeProject('a').id, makeProject('a').id)
})

test('merging names the project after the document dropped onto', () => {
  assert.equal(mergedProjectName(doc('a', 'Launch'), doc('b', 'Budget')), 'Launch')
  // An untitled target falls through to the one being dragged.
  assert.equal(mergedProjectName(doc('a', ''), doc('b', 'Budget')), 'Budget')
  assert.equal(mergedProjectName(doc('a', '  '), doc('b', '')), 'New project')
})

test('documents are grouped under their projects', () => {
  const p: Project = { id: 'p1', name: 'Launch', createdAt: 0, updatedAt: 0 }
  const docs = [
    doc('a', 'A', { projectId: 'p1' }),
    doc('b', 'B', { projectId: 'p1' }),
    doc('c', 'C'),
  ]
  const { projects, loose } = groupDocs(docs, [p])
  assert.equal(projects.length, 1)
  assert.deepEqual(projects[0].docs.map((d) => d.id), ['a', 'b'])
  assert.deepEqual(loose.map((d) => d.id), ['c'])
})

test('a document pointing at a missing project stays visible as loose', () => {
  // A dangling id can happen if a project delete syncs before the documents
  // that were in it. Hiding the document would look like data loss.
  const { projects, loose } = groupDocs([doc('a', 'A', { projectId: 'gone' })], [])
  assert.equal(projects.length, 0)
  assert.deepEqual(loose.map((d) => d.id), ['a'])
})

test('a deleted project does not swallow its documents', () => {
  const p: Project = { id: 'p1', name: 'Old', createdAt: 0, updatedAt: 0, deletedAt: 1 }
  const { projects, loose } = groupDocs([doc('a', 'A', { projectId: 'p1' })], [p])
  assert.equal(projects.length, 0)
  assert.deepEqual(loose.map((d) => d.id), ['a'])
})

test('deleted documents are left out of both', () => {
  const p: Project = { id: 'p1', name: 'Launch', createdAt: 0, updatedAt: 0 }
  const { projects, loose } = groupDocs(
    [doc('a', 'A', { projectId: 'p1', deletedAt: 5 }), doc('b', 'B', { deletedAt: 5 })],
    [p],
  )
  assert.deepEqual(projects[0].docs, [])
  assert.deepEqual(loose, [])
})

test('an empty project still appears, so it can be renamed or removed', () => {
  const p: Project = { id: 'p1', name: 'Empty', createdAt: 0, updatedAt: 0 }
  const { projects } = groupDocs([], [p])
  assert.equal(projects.length, 1)
  assert.equal(projects[0].project.name, 'Empty')
})

test('projects are ordered by their most recently touched document', () => {
  const older: Project = { id: 'p1', name: 'Older', createdAt: 0, updatedAt: 1 }
  const newer: Project = { id: 'p2', name: 'Newer', createdAt: 0, updatedAt: 2 }
  const docs = [
    doc('a', 'A', { projectId: 'p2', updatedAt: 50 }),
    doc('b', 'B', { projectId: 'p1', updatedAt: 900 }),
  ]
  const { projects } = groupDocs(docs, [older, newer])
  assert.equal(projects[0].project.id, 'p1', 'the project with the newest document should lead')
})

test('docsInProject returns only live members', () => {
  const docs = [
    doc('a', 'A', { projectId: 'p1' }),
    doc('b', 'B', { projectId: 'p2' }),
    doc('c', 'C', { projectId: 'p1', deletedAt: 1 }),
  ]
  assert.deepEqual(docsInProject(docs, 'p1').map((d) => d.id), ['a'])
})

test('search matches titles first, then content', () => {
  const docs = [
    withText('a', 'Notes', 'mentions budget somewhere'),
    withText('b', 'Budget', 'nothing relevant'),
    withText('c', 'Budget review', 'nothing relevant'),
  ]
  const hits = searchDocs(docs, 'budget')
  assert.deepEqual(hits.map((d) => d.id), ['b', 'c', 'a'])
})

test('search finds text inside the document body', () => {
  const docs = [withText('a', 'Untitled', 'the quick brown fox')]
  assert.deepEqual(searchDocs(docs, 'brown').map((d) => d.id), ['a'])
  assert.deepEqual(searchDocs(docs, 'zebra'), [])
})

test('search is case insensitive and ignores surrounding spaces', () => {
  const docs = [withText('a', 'Launch Plan', 'body')]
  assert.equal(searchDocs(docs, 'LAUNCH').length, 1)
  assert.equal(searchDocs(docs, '  launch  ').length, 1)
})

test('an empty query returns everything, unreordered', () => {
  const docs = [doc('a', 'A'), doc('b', 'B')]
  assert.deepEqual(searchDocs(docs, '').map((d) => d.id), ['a', 'b'])
  assert.deepEqual(searchDocs(docs, '   ').map((d) => d.id), ['a', 'b'])
})

test('a project of one dissolves', () => {
  assert.equal(shouldDissolve(0), true)
  assert.equal(shouldDissolve(1), true)
  assert.equal(shouldDissolve(2), false)
})
