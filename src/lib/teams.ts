'use client'

import { newId } from './id.ts'
import { getSupabase } from './supabase.ts'
import type { DraftTask, Member } from './team-chat.ts'

/**
 * Teams: the server side of a shared chat and the work that comes out of it.
 *
 * ## Why this one cannot be local-first
 *
 * Everything else in Pad is on the device first and the server second,
 * because everything else is one person's. A team is the opposite by
 * definition: the point of it is that somebody else can see what you wrote,
 * so the server is where it lives and this file is a thin set of queries
 * against it. Notes are untouched by any of this — the whole of Pad works
 * with no account, and turning Team mode on does not change that.
 *
 * ## Why every function here reports rather than throws
 *
 * The same reason as the World: no account, no migration, no network, and
 * the answer is a sentence on a screen, never a crash in front of somebody's
 * writing.
 *
 * ## Adding somebody by their email address
 *
 * A browser cannot look a person up by address — `auth.users` is not
 * readable from one and must never be. So an invitation is a member row with
 * no user id, and `claim_invites()` on the server attaches it the first time
 * that address signs in. That is why somebody added while they are asleep
 * simply has the team waiting for them when they next open the app.
 */

export interface Team {
  id: string
  name: string
  owner: string
  createdAt: number
}

export interface TeamMessage {
  id: string
  teamId: string
  author: string
  authorName: string
  body: string
  createdAt: number
  /** Stamped when it was corrected, so the row can say so. */
  editedAt: number | null
  /** What it is answering, if anything. */
  replyTo: string | null
}

export interface TeamTask {
  id: string
  teamId: string
  text: string
  assignee: string | null
  assigneeName: string
  /** In the words it was written in. Never a parsed date. */
  due: string
  done: boolean
  createdAt: number
  createdBy: string | null
  sourceMessage: string | null
}

/** What went wrong, in a sentence, or nothing when it worked. */
export type Problem = string | undefined

/**
 * When each team last had something said in it.
 *
 * One call for every team rather than one per team per minute — see
 * `team_pulse()` in 0008_team_roles.sql. What is unread is worked out
 * against what this device last looked at, which is kept on the device:
 * writing a row every time somebody glances at a chat is a write per
 * glance.
 */
export interface Pulse {
  teamId: string
  name: string
  lastAt: number
  lastAuthor: string
  messages: number
}

const OFFLINE = 'Teams need an account, which is not set up on this copy of Pad.'

/** The commonest failure by far, and the one nobody can act on without help. */
function explain(message: string): string {
  if (/relation|does not exist|schema|team_/i.test(message)) {
    return 'Teams need migration 0007_teams.sql to be run on your database.'
  }
  return message
}

/* ------------------------------------------------------------------ teams */

/**
 * Every team this account is in.
 *
 * `claim_invites()` runs first, so somebody who was added by email while
 * they were away walks into their teams on the next load rather than on
 * some later action nobody would think to take.
 */
export async function myTeams(): Promise<{ teams: Team[]; problem: Problem }> {
  const db = await getSupabase()
  if (!db) return { teams: [], problem: OFFLINE }
  try {
    // A failure here is not worth reporting: it means no invitations were
    // waiting, or the function is not there yet, and the list below is
    // still the honest answer to "what am I in".
    await db.rpc('claim_invites').then(
      () => {},
      () => {},
    )
    const { data, error } = await db
      .from('teams')
      .select('id, name, owner, created_at')
      .order('created_at', { ascending: true })
    if (error) return { teams: [], problem: explain(error.message) }
    return {
      teams: (data ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name ?? '').trim(),
        owner: String(row.owner),
        createdAt: Number(row.created_at) || 0,
      })),
      problem: undefined,
    }
  } catch {
    return { teams: [], problem: 'Could not reach the server.' }
  }
}

/** Makes a team, with whoever made it as its first member. */
export async function createTeam(
  name: string,
  me: { id: string; email: string; name: string },
): Promise<{ team?: Team; problem: Problem }> {
  const db = await getSupabase()
  if (!db) return { problem: OFFLINE }
  const now = Date.now()
  const team: Team = { id: newId(), name: name.trim() || 'Team', owner: me.id, createdAt: now }
  try {
    const { error } = await db
      .from('teams')
      .insert({ id: team.id, name: team.name, owner: me.id, created_at: now, updated_at: now })
    if (error) return { problem: explain(error.message) }
    /*
      And immediately a member of it. Not a trigger: a team whose owner is
      only its owner cannot be read back by the policy that asks whether you
      are in it, so the row that makes them a member is part of making the
      team rather than something that happens later.
    */
    await db.from('team_members').insert({
      id: newId(),
      team_id: team.id,
      user_id: me.id,
      email: me.email,
      name: me.name || me.email.split('@')[0],
      created_at: now,
    })
    return { team, problem: undefined }
  } catch {
    return { problem: 'Could not reach the server.' }
  }
}

/* ---------------------------------------------------------------- members */

export async function teamMembers(teamId: string): Promise<Member[]> {
  const db = await getSupabase()
  if (!db) return []
  try {
    const { data, error } = await db
      .from('team_members')
      .select('id, user_id, email, name, role')
      .eq('team_id', teamId)
      .order('created_at', { ascending: true })
    if (error || !data) return []
    return data.map((row) => ({
      id: String(row.id),
      userId: row.user_id ? String(row.user_id) : null,
      email: String(row.email ?? ''),
      name: String(row.name ?? '').trim() || String(row.email ?? '').split('@')[0],
      admin: String(row.role ?? '') === 'admin',
    }))
  } catch {
    return []
  }
}

/** Makes somebody an admin, or takes it back. Admins only — the policy says so. */
export async function setMemberRole(memberId: string, admin: boolean): Promise<Problem> {
  const db = await getSupabase()
  if (!db) return OFFLINE
  try {
    const { error } = await db
      .from('team_members')
      .update({ role: admin ? 'admin' : 'member' })
      .eq('id', memberId)
    return error ? explain(error.message) : undefined
  } catch {
    return 'Could not reach the server.'
  }
}

/**
 * Takes somebody out of a team.
 *
 * A real delete rather than a tombstone, and the one place in this app
 * where that is right: the row *is* the permission, so keeping a marked
 * copy of it would be keeping the thing it is supposed to remove. The
 * owner's row cannot be deleted at all — the database refuses it — so a
 * team can never be left with nobody able to change it.
 */
export async function removeMember(memberId: string): Promise<Problem> {
  const db = await getSupabase()
  if (!db) return OFFLINE
  try {
    const { error } = await db.from('team_members').delete().eq('id', memberId)
    if (error) return explain(error.message)
    return undefined
  } catch {
    return 'Could not reach the server.'
  }
}

/** Whether this account may change this team. Read from the member list. */
export function isAdmin(members: Member[], userId: string, ownerId: string): boolean {
  if (userId === ownerId) return true
  return members.some((member) => member.userId === userId && member.admin)
}

/**
 * Adds somebody by their email address.
 *
 * They are a member from this moment as far as the team is concerned — named
 * in the list, available to be given a task — and the row is attached to
 * their account the first time they sign in. Nothing is emailed: this app
 * does not have a mail sender, and saying "invitation sent" when nothing was
 * sent is worse than saying what actually happened.
 */
export async function addMember(teamId: string, email: string): Promise<Problem> {
  const db = await getSupabase()
  if (!db) return OFFLINE
  const address = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return 'That does not look like an email address.'
  try {
    const { error } = await db.from('team_members').insert({
      id: newId(),
      team_id: teamId,
      user_id: null,
      email: address,
      name: address.split('@')[0],
      created_at: Date.now(),
    })
    if (error) {
      if (/duplicate|unique/i.test(error.message)) return 'They are already in this team.'
      return explain(error.message)
    }
    return undefined
  } catch {
    return 'Could not reach the server.'
  }
}

/* --------------------------------------------------------------- messages */

/** How many messages one load of a chat brings back. */
export const CHAT_PAGE = 60

export async function teamMessages(teamId: string): Promise<TeamMessage[]> {
  const db = await getSupabase()
  if (!db) return []
  try {
    const { data, error } = await db
      .from('team_messages')
      .select('id, team_id, author, author_name, body, created_at, edited_at, reply_to')
      .eq('team_id', teamId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(CHAT_PAGE)
    if (error || !data) return []
    // Oldest first for reading, newest first for fetching: a chat is read
    // downwards and only its last page matters.
    return data
      .map((row) => ({
        id: String(row.id),
        teamId: String(row.team_id),
        author: String(row.author),
        authorName: String(row.author_name ?? ''),
        body: String(row.body ?? ''),
        createdAt: Number(row.created_at) || 0,
        editedAt: row.edited_at ? Number(row.edited_at) : null,
        replyTo: row.reply_to ? String(row.reply_to) : null,
      }))
      .reverse()
  } catch {
    return []
  }
}

export async function sendMessage(
  teamId: string,
  author: { id: string; name: string },
  body: string,
  /** What this is answering, when it is answering something. */
  replyTo?: string,
): Promise<{ message?: TeamMessage; problem: Problem }> {
  const db = await getSupabase()
  if (!db) return { problem: OFFLINE }
  const message: TeamMessage = {
    id: newId(),
    teamId,
    author: author.id,
    authorName: author.name,
    body: body.trim(),
    createdAt: Date.now(),
    editedAt: null,
    replyTo: replyTo ?? null,
  }
  if (!message.body) return { problem: undefined }
  try {
    const { error } = await db.from('team_messages').insert({
      id: message.id,
      team_id: teamId,
      author: author.id,
      author_name: author.name,
      body: message.body,
      created_at: message.createdAt,
      reply_to: replyTo ?? null,
    })
    if (error) return { problem: explain(error.message) }
    return { message, problem: undefined }
  } catch {
    return { problem: 'Could not reach the server.' }
  }
}

/**
 * Correcting something you said.
 *
 * The row stays and is stamped, so the chat can say it was edited: a
 * message that changed with no sign of it is a record you cannot rely on.
 * Only the author can do this — the policy enforces it, not this file.
 */
export async function editMessage(id: string, body: string): Promise<Problem> {
  const db = await getSupabase()
  if (!db) return OFFLINE
  const trimmed = body.trim()
  if (!trimmed) return 'A message cannot be empty. Delete it instead.'
  try {
    const { error } = await db
      .from('team_messages')
      .update({ body: trimmed, edited_at: Date.now() })
      .eq('id', id)
    return error ? explain(error.message) : undefined
  } catch {
    return 'Could not reach the server.'
  }
}

/**
 * Taking one down.
 *
 * A tombstone rather than a removal, as everything deleted here is: the
 * tasks that came out of it point at it, and a task whose source has gone
 * missing is a task nobody can check.
 */
export async function deleteMessage(id: string): Promise<Problem> {
  const db = await getSupabase()
  if (!db) return OFFLINE
  try {
    const { error } = await db
      .from('team_messages')
      .update({ deleted_at: Date.now() })
      .eq('id', id)
    return error ? explain(error.message) : undefined
  } catch {
    return 'Could not reach the server.'
  }
}

/* ------------------------------------------------------------- the pulse */

/**
 * When every team of mine last had something said in it.
 *
 * One request, whatever the number of teams. It is what the mark on the
 * notes screen is read from, and it is deliberately the smallest question
 * that answers it: no messages, no tasks, no members — five columns a team.
 */
export async function teamPulse(): Promise<Pulse[]> {
  const db = await getSupabase()
  if (!db) return []
  try {
    const { data, error } = await db.rpc('team_pulse')
    if (error || !Array.isArray(data)) return []
    return data.map((row: Record<string, unknown>) => ({
      teamId: String(row.team_id),
      name: String(row.name ?? ''),
      lastAt: Number(row.last_at) || 0,
      lastAuthor: String(row.last_author ?? ''),
      messages: Number(row.messages) || 0,
    }))
  } catch {
    return []
  }
}

/* ------------------------------------------------- renaming and deleting */

export async function renameTeam(teamId: string, name: string): Promise<Problem> {
  const db = await getSupabase()
  if (!db) return OFFLINE
  const trimmed = name.trim()
  if (!trimmed) return 'A team needs a name.'
  try {
    const { error } = await db
      .from('teams')
      .update({ name: trimmed, updated_at: Date.now() })
      .eq('id', teamId)
    return error ? explain(error.message) : undefined
  } catch {
    return 'Could not reach the server.'
  }
}

/**
 * Deleting a team, and everything in it.
 *
 * The one destructive act here that cannot be undone from inside the app —
 * the members, the chat and the board go with it, by the foreign keys. That
 * is why the interface makes somebody type the team's name first, and why
 * only its owner can do it at all.
 */
export async function deleteTeam(teamId: string): Promise<Problem> {
  const db = await getSupabase()
  if (!db) return OFFLINE
  try {
    const { error } = await db.from('teams').delete().eq('id', teamId)
    return error ? explain(error.message) : undefined
  } catch {
    return 'Could not reach the server.'
  }
}

/* ------------------------------------------------------------------ tasks */

export async function teamTasks(teamId: string): Promise<TeamTask[]> {
  const db = await getSupabase()
  if (!db) return []
  try {
    const { data, error } = await db
      .from('team_tasks')
      .select(
        'id, team_id, text, assignee, assignee_name, due, done, created_at, created_by, source_message',
      )
      .eq('team_id', teamId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
    if (error || !data) return []
    return data.map((row) => ({
      id: String(row.id),
      teamId: String(row.team_id),
      text: String(row.text ?? ''),
      assignee: row.assignee ? String(row.assignee) : null,
      assigneeName: String(row.assignee_name ?? ''),
      due: String(row.due ?? ''),
      done: !!row.done,
      createdAt: Number(row.created_at) || 0,
      createdBy: row.created_by ? String(row.created_by) : null,
      sourceMessage: row.source_message ? String(row.source_message) : null,
    }))
  } catch {
    return []
  }
}

/** Writes a batch of tasks, which is what one message produces. */
export async function addTasks(
  teamId: string,
  drafts: DraftTask[],
  by: string,
  sourceMessage?: string,
): Promise<Problem> {
  const db = await getSupabase()
  if (!db) return OFFLINE
  if (!drafts.length) return undefined
  const now = Date.now()
  try {
    const { error } = await db.from('team_tasks').insert(
      drafts.map((draft, i) => ({
        id: newId(),
        team_id: teamId,
        text: draft.text,
        assignee: draft.assignee ?? null,
        assignee_name: draft.assigneeName ?? '',
        due: draft.due ?? '',
        done: false,
        // Spread by a millisecond each so a batch keeps the order it was
        // written in rather than coming back in whatever order Postgres
        // feels like for identical timestamps.
        created_at: now + i,
        updated_at: now + i,
        created_by: by,
        source_message: sourceMessage ?? null,
      })),
    )
    return error ? explain(error.message) : undefined
  } catch {
    return 'Could not reach the server.'
  }
}

export async function setTaskDone(id: string, done: boolean): Promise<Problem> {
  const db = await getSupabase()
  if (!db) return OFFLINE
  try {
    const { error } = await db
      .from('team_tasks')
      .update({ done, updated_at: Date.now() })
      .eq('id', id)
    return error ? explain(error.message) : undefined
  } catch {
    return 'Could not reach the server.'
  }
}

/**
 * Corrects the wording of a task.
 *
 * Anybody in the team may, which is what the "members can change tasks"
 * policy in 0007 has always said — the same permission that lets anybody
 * tick one. A task is the team's, not its author's: a typo in a job with
 * your name on it that only the person who typed it can fix is a typo that
 * stays there until somebody is free.
 *
 * What it does not touch is the message it came from. The chat is the
 * record of what was actually said, and a task is a reading of it; editing
 * the reading must never rewrite the sentence.
 */
export async function setTaskText(id: string, text: string): Promise<Problem> {
  const db = await getSupabase()
  if (!db) return OFFLINE
  const wanted = text.trim()
  if (!wanted) return 'A task needs some words.'
  try {
    const { error } = await db
      .from('team_tasks')
      .update({ text: wanted, updated_at: Date.now() })
      .eq('id', id)
    return error ? explain(error.message) : undefined
  } catch {
    return 'Could not reach the server.'
  }
}

/** When it is for, in the words somebody wrote — never a parsed date. */
export async function setTaskDue(id: string, due: string): Promise<Problem> {
  const db = await getSupabase()
  if (!db) return OFFLINE
  try {
    const { error } = await db
      .from('team_tasks')
      .update({ due: due.trim(), updated_at: Date.now() })
      .eq('id', id)
    return error ? explain(error.message) : undefined
  } catch {
    return 'Could not reach the server.'
  }
}

export async function setTaskAssignee(
  id: string,
  assignee: string | null,
  assigneeName: string,
): Promise<Problem> {
  const db = await getSupabase()
  if (!db) return OFFLINE
  try {
    const { error } = await db
      .from('team_tasks')
      .update({ assignee, assignee_name: assigneeName, updated_at: Date.now() })
      .eq('id', id)
    return error ? explain(error.message) : undefined
  } catch {
    return 'Could not reach the server.'
  }
}

/**
 * Deletes a task — as a tombstone, like everything else deleted in this app.
 *
 * The row stays and is marked, so another device that has it in memory
 * learns it is gone instead of putting it back the next time it reads the
 * list.
 */
export async function deleteTask(id: string): Promise<Problem> {
  const db = await getSupabase()
  if (!db) return OFFLINE
  const now = Date.now()
  try {
    const { error } = await db
      .from('team_tasks')
      .update({ deleted_at: now, updated_at: now })
      .eq('id', id)
    return error ? explain(error.message) : undefined
  } catch {
    return 'Could not reach the server.'
  }
}
