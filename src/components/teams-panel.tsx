'use client'

import {
  CircleCheck,
  Circle,
  ListChecks,
  LoaderCircle,
  MessageSquare,
  Plus,
  Send,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  keepOnlyReal,
  matchMembers,
  mentionAt,
  mergeTasks,
  readTasks,
  type DraftTask,
  type Member,
} from '@/lib/team-chat'
import {
  addMember,
  addTasks,
  createTeam,
  deleteTask,
  myTeams,
  sendMessage,
  setTaskDone,
  teamMembers,
  teamMessages,
  teamTasks,
  type Team,
  type TeamMessage,
  type TeamTask,
} from '@/lib/teams'
import { stamp } from '@/lib/when'
import { useKeyboardInset } from './keyboard'

/**
 * A team: a chat, and the work that comes out of it.
 *
 * ## Why a chat rather than a form
 *
 * Because nobody opens a task manager to write down a task — the same
 * observation the Actions tab is built on, pointed at a group instead of a
 * person. Work gets agreed in a sentence somebody types to somebody else:
 * "@ada can you send the service charge figures by Friday". So that is the
 * input. You type the sentence you were going to type anyway, and the task
 * appears on the board with Ada's name and Friday against it.
 *
 * ## The rule this screen lives or dies by
 *
 * A task has to be a thing somebody actually said. The device reads each
 * message with string rules, the model reads the same message and is told to
 * pick lines out rather than think of any, and then everything it returns is
 * checked against the words of the message before it is written down. See
 * `lib/team-chat.ts`, where all three of those live as pure functions with
 * unit tests. An invented job with somebody else's name on it is the failure
 * that would make a team stop reading the list.
 *
 * ## What is shared and what is not
 *
 * This, and nothing else. Notes stay exactly as private as they were: Team
 * mode does not move them, copy them or show them to anybody. A team sees
 * its own chat and its own tasks, enforced by row-level security in the
 * database rather than by this file — see 0007_teams.sql.
 */

/** How often the chat and the board look for what other people have done. */
const POLL_MS = 10_000

export default function TeamsPanel({
  me,
}: {
  /** Null when nobody is signed in, which is what a team needs. */
  me: { id: string; email: string; name: string } | null
}) {
  const [teams, setTeams] = useState<Team[]>([])
  const [teamId, setTeamId] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [messages, setMessages] = useState<TeamMessage[]>([])
  const [tasks, setTasks] = useState<TeamTask[]>([])
  const [view, setView] = useState<'chat' | 'actions'>('chat')
  const [problem, setProblem] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)

  /* --------------------------------------------------------------- loading */

  useEffect(() => {
    if (!me) return
    let cancelled = false
    void (async () => {
      const { teams: mine, problem: why } = await myTeams()
      if (cancelled) return
      setTeams(mine)
      setTeamId((current) => current ?? mine[0]?.id ?? null)
      setProblem(why)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [me])

  /*
    The team's contents, and then again every ten seconds.

    Polling rather than a live subscription: the realtime client is another
    chunk to download and another thing to hold open on a phone, and a chat
    that catches up within ten seconds is a chat nobody notices is polling.
    It stops while the tab is in the background, because a message nobody is
    looking at is not worth a request.
  */
  useEffect(() => {
    if (!teamId) return
    let cancelled = false
    const read = async () => {
      if (document.visibilityState !== 'visible') return
      const [people, said, work] = await Promise.all([
        teamMembers(teamId),
        teamMessages(teamId),
        teamTasks(teamId),
      ])
      if (cancelled) return
      setMembers(people)
      setMessages(said)
      setTasks(work)
    }
    void read()
    const id = setInterval(() => void read(), POLL_MS)
    document.addEventListener('visibilitychange', () => void read())
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [teamId])

  const team = teams.find((t) => t.id === teamId) ?? null
  const outstanding = tasks.filter((task) => !task.done)

  /** Reads the team back after something has been written to it. */
  const refresh = async () => {
    if (!teamId) return
    const [said, work] = await Promise.all([teamMessages(teamId), teamTasks(teamId)])
    setMessages(said)
    setTasks(work)
  }

  if (!me) {
    return (
      <p className="mt-6 rounded-xl border border-[var(--color-line)] bg-[var(--color-hover)] p-4 text-[14px] text-[var(--color-muted)]">
        A team needs an account, so there is somewhere for the chat to live. Sign in at the top of
        this screen. Your own notes work exactly as they always have without one.
      </p>
    )
  }

  if (loading) {
    return <p className="py-12 text-center text-[15px] text-[var(--color-faint)]">One moment…</p>
  }

  if (problem) {
    return (
      <p className="mt-6 rounded-xl border border-[var(--color-line)] bg-[var(--color-hover)] p-4 text-[13px] text-[var(--color-muted)]">
        {problem}
      </p>
    )
  }

  if (!team) {
    return <NoTeamYet me={me} onMade={(made) => {
      setTeams([made])
      setTeamId(made.id)
    }} />
  }

  return (
    <div className="pb-4">
      {/*
        Which team, and a way to start another. A row of pills rather than a
        dropdown: most people are in one or two, and a menu to choose between
        two things is a menu that exists to be opened.
      */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Users size={14} className="shrink-0 text-[var(--color-faint)]" />
        {teams.map((one) => (
          <button
            key={one.id}
            type="button"
            onClick={() => setTeamId(one.id)}
            className={`rounded-full px-3 py-1.5 text-[13px] ${
              one.id === teamId
                ? 'bg-[var(--color-hover)] font-medium text-[var(--color-ink)]'
                : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
            }`}
          >
            {one.name}
          </button>
        ))}
        <NewTeam
          me={me}
          onMade={(made) => {
            setTeams((all) => [...all, made])
            setTeamId(made.id)
          }}
        />
      </div>

      <div
        role="tablist"
        aria-label="This team"
        className="mt-2 flex items-stretch gap-1 border-b border-[var(--color-line)]"
      >
        <Tab
          on={view === 'chat'}
          onPress={() => setView('chat')}
          icon={<MessageSquare size={14} />}
          label="Chat"
        />
        <Tab
          on={view === 'actions'}
          onPress={() => setView('actions')}
          icon={<ListChecks size={14} />}
          label="Actions"
          count={outstanding.length}
        />
      </div>

      {view === 'chat' ? (
        <Chat
          me={me}
          teamId={team.id}
          members={members}
          messages={messages}
          onSent={() => void refresh()}
          onMembers={() => void teamMembers(team.id).then(setMembers)}
        />
      ) : (
        <Board
          me={me}
          teamId={team.id}
          members={members}
          tasks={tasks}
          onChanged={() => void refresh()}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------ making one */

function NoTeamYet({
  me,
  onMade,
}: {
  me: { id: string; email: string; name: string }
  onMade: (team: Team) => void
}) {
  return (
    <div className="mt-6 rounded-xl border border-[var(--color-line)] p-4">
      <h2 className="text-[15px] font-medium">Start a team</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-muted)]">
        A team is a chat and the work that comes out of it. Type what needs doing the way you
        would say it — <span className="text-[var(--color-ink)]">@ada send the figures by
        Friday</span> — and it appears on the board with her name and the day against it. Add
        people by their email address; your own notes are not shared with anybody.
      </p>
      <div className="mt-3">
        <NewTeam me={me} onMade={onMade} primary />
      </div>
    </div>
  )
}

function NewTeam({
  me,
  onMade,
  primary,
}: {
  me: { id: string; email: string; name: string }
  onMade: (team: Team) => void
  primary?: boolean
}) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | undefined>()

  const make = async () => {
    if (busy) return
    setBusy(true)
    const { team, problem: why } = await createTeam(name, me)
    setBusy(false)
    setProblem(why)
    if (!team) return
    setNaming(false)
    setName('')
    onMade(team)
  }

  if (!naming) {
    return (
      <button
        type="button"
        onClick={() => setNaming(true)}
        className={
          primary
            ? 'rounded-full bg-[var(--color-accent)] px-4 py-2 text-[14px] font-medium text-white'
            : 'flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[13px] text-[var(--color-muted)] hover:text-[var(--color-ink)]'
        }
      >
        {!primary && <Plus size={13} />}
        New team
      </button>
    )
  }

  return (
    <span className="flex items-center gap-1">
      <input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void make()
          if (event.key === 'Escape') setNaming(false)
        }}
        placeholder="What is it called?"
        aria-label="Team name"
        maxLength={40}
        className="min-w-0 flex-1 rounded-full border border-[var(--color-line)] bg-[var(--color-hover)] px-3 py-1.5 text-[13px] outline-none"
      />
      <button
        type="button"
        onClick={() => void make()}
        disabled={busy}
        className="rounded-full bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
      >
        {busy ? '…' : 'Make it'}
      </button>
      {problem && <span className="text-[12px] text-[var(--color-danger)]">{problem}</span>}
    </span>
  )
}

/* ----------------------------------------------------------------- chat */

function Chat({
  me,
  teamId,
  members,
  messages,
  onSent,
  onMembers,
}: {
  me: { id: string; email: string; name: string }
  teamId: string
  members: Member[]
  messages: TeamMessage[]
  onSent: () => void
  onMembers: () => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState<DraftTask[] | null>(null)
  const [problem, setProblem] = useState<string | undefined>()
  const [picking, setPicking] = useState<{ at: number; query: string } | null>(null)
  const [adding, setAdding] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const foot = useRef<HTMLDivElement>(null)
  const keyboard = useKeyboardInset()

  // The newest message, which is the one somebody came here to read.
  useEffect(() => {
    foot.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  /** Watches for the "@" being typed, and what follows it. */
  const onType = (value: string, caret: number) => {
    setText(value)
    setPicking(mentionAt(value, caret))
  }

  const choose = (member: Member) => {
    if (!picking) return
    const el = box.current
    const before = text.slice(0, picking.at)
    const after = text.slice(picking.at + 1 + picking.query.length)
    const handle = member.name.trim().split(/\s+/)[0]
    const next = `${before}@${handle} ${after.replace(/^\s+/, '')}`
    setText(next)
    setPicking(null)
    // Back into the box, with the caret after the name rather than at the
    // end of whatever was already typed underneath.
    requestAnimationFrame(() => {
      el?.focus()
      const at = before.length + handle.length + 2
      el?.setSelectionRange(at, at)
    })
  }

  /**
   * Sends the message, and writes down the work in it.
   *
   * The message is saved first and separately: it is what somebody said, it
   * is the record, and it must not be lost because the reading of it failed.
   * Everything after that is best effort — the device's own reading always
   * runs, the model is asked only where a key is configured, and anything it
   * returns is checked against the words of the message before it is kept.
   */
  const send = async () => {
    const said = text.trim()
    if (!said || busy) return
    setBusy(true)
    setProblem(undefined)
    setMade(null)

    const { message, problem: why } = await sendMessage(teamId, { id: me.id, name: me.name }, said)
    if (!message) {
      setBusy(false)
      setProblem(why ?? 'That did not send.')
      return
    }
    setText('')
    setPicking(null)
    onSent()

    // What this device can see on its own: free, instant, and the whole of
    // the feature when there is no key.
    let drafts = readTasks(said, members)

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat-tasks',
          text: said,
          names: members.map((m) => m.name).join(', '),
        }),
      })
      const data = (await response.json()) as {
        tasks?: Array<{ text: string; who: string; due: string }>
      }
      if (response.ok && Array.isArray(data.tasks)) {
        const fromModel = data.tasks.map((row) => {
          const who = members.find(
            (m) => m.name.toLowerCase() === row.who.trim().toLowerCase(),
          )
          return {
            text: row.text,
            ...(who?.userId ? { assignee: who.userId } : {}),
            ...(who ? { assigneeName: who.name } : {}),
            ...(row.due ? { due: row.due } : {}),
          }
        })
        // The guard, and the reason this screen can be trusted: anything
        // made of words the message did not contain is thrown away here.
        drafts = mergeTasks(drafts, keepOnlyReal(fromModel, said))
      }
    } catch {
      // No key, no network, or a refusal. The device's own reading stands.
    }

    if (drafts.length) {
      const why2 = await addTasks(teamId, drafts, me.id, message.id)
      if (why2) setProblem(why2)
      else setMade(drafts)
      onSent()
    }
    setBusy(false)
  }

  return (
    <div>
      {/* Who is in it, and the + that adds somebody. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--color-faint)]">
        {members.map((member) => (
          <span
            key={member.email}
            title={member.userId ? member.email : `${member.email} — has not signed in yet`}
            className="rounded-full bg-[var(--color-hover)] px-2 py-1"
          >
            {member.name}
            {!member.userId && ' ·'}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setAdding((on) => !on)}
          aria-label="Add somebody to this team"
          className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
        >
          <UserPlus size={13} />
          Add
        </button>
      </div>
      {adding && (
        <AddSomebody
          teamId={teamId}
          onDone={() => {
            setAdding(false)
            onMembers()
          }}
        />
      )}

      {/* What has been said. */}
      <ul className="mt-3 space-y-3">
        {messages.length === 0 && (
          <li className="py-8 text-center text-[14px] text-[var(--color-faint)]">
            Nothing said yet. Type what needs doing and it turns into work below.
          </li>
        )}
        {messages.map((message) => (
          <li key={message.id} className="flex gap-2.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-hover)] text-[11px] font-medium text-[var(--color-muted)]">
              {(message.authorName || '?').trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-[var(--color-faint)]">
                {message.author === me.id ? 'You' : message.authorName || 'Somebody'}
                {' · '}
                {stamp(message.createdAt)}
              </p>
              <p className="pad-serif text-[15px] leading-relaxed whitespace-pre-wrap">
                {message.body}
              </p>
            </div>
          </li>
        ))}
        <div ref={foot} />
      </ul>

      {/*
        What was written down, said once, under the box that caused it. Not a
        notification and not a dialog: it is the receipt for the thing that
        has just happened, and it goes away when the next message is sent.
      */}
      {made && made.length > 0 && (
        <p className="mt-3 rounded-xl bg-[var(--color-accent-soft)] px-3 py-2 text-[13px] text-[var(--color-ink)]">
          {made.length === 1 ? 'One thing' : `${made.length} things`} added to Actions:{' '}
          {made.map((task) => task.text).join('; ')}
        </p>
      )}
      {problem && <p className="mt-2 text-[13px] text-[var(--color-danger)]">{problem}</p>}

      {/* The box, above the keyboard on a phone, as everything else here is. */}
      <div
        style={{ paddingBottom: keyboard }}
        className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--color-line)] bg-[var(--color-paper)] px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto w-full max-w-3xl">
          {/*
            The people to choose from, above the box, while an "@" is being
            typed. Above rather than below because below is the keyboard.
          */}
          {picking && members.length > 0 && (
            <div className="mb-1 flex flex-wrap gap-1">
              {matchMembers(members, picking.query).map((member) => (
                <button
                  key={member.email}
                  type="button"
                  // The keyboard stays up: every button steals the focus and
                  // a phone takes the keys down with it.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(member)}
                  className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[13px] hover:border-[var(--color-faint)]"
                >
                  {member.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={box}
              value={text}
              rows={1}
              onChange={(event) => onType(event.target.value, event.target.selectionStart)}
              onKeyUp={(event) =>
                setPicking(mentionAt(event.currentTarget.value, event.currentTarget.selectionStart))
              }
              onKeyDown={(event) => {
                // Ctrl+Enter sends, as it does in the note box. Enter is a
                // new line: a chat message about four jobs is four lines.
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  void send()
                }
              }}
              aria-label="Say what needs doing"
              placeholder="What needs doing? Use @ to give it to somebody."
              className="pad-serif max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-[var(--color-line)] bg-[var(--color-hover)] px-3 py-2.5 text-[15px] outline-none placeholder:text-[var(--color-faint)]"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={!text.trim() || busy}
              aria-label="Send"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-white disabled:opacity-40"
            >
              {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AddSomebody({ teamId, onDone }: { teamId: string; onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | undefined>()

  const add = async () => {
    if (busy) return
    setBusy(true)
    const why = await addMember(teamId, email)
    setBusy(false)
    setProblem(why)
    if (why) return
    setEmail('')
    onDone()
  }

  return (
    <div className="mt-2 rounded-xl border border-[var(--color-line)] p-2.5">
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void add()
          }}
          placeholder="their@email.com"
          aria-label="Their email address"
          className="min-w-0 flex-1 rounded-full border border-[var(--color-line)] bg-[var(--color-hover)] px-3 py-1.5 text-[13px] outline-none"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy || !email.trim()}
          className="rounded-full bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
        >
          {busy ? '…' : 'Add'}
        </button>
      </div>
      {/* What actually happens, rather than "invitation sent" — nothing is
          emailed, because this app has no mail sender. */}
      <p className="mt-1.5 text-[12px] text-[var(--color-faint)]">
        They join the moment you add them, and the team is waiting for them the next time they
        sign in with that address. Nothing is emailed.
      </p>
      {problem && <p className="mt-1 text-[12px] text-[var(--color-danger)]">{problem}</p>}
    </div>
  )
}

/* ---------------------------------------------------------------- the board */

function Board({
  me,
  teamId,
  members,
  tasks,
  onChanged,
}: {
  me: { id: string; email: string; name: string }
  teamId: string
  members: Member[]
  tasks: TeamTask[]
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [showDone, setShowDone] = useState(false)

  const outstanding = tasks.filter((task) => !task.done)
  const done = tasks.filter((task) => task.done)

  /*
    By hand, which every list of work needs however good the reading of the
    chat is: somebody remembers something in the corridor, and asking them to
    go and phrase it as a chat message is asking them not to bother. It takes
    the same @ and the same date words as a message does — one set of rules,
    so a task added here and a task read out of the chat are the same kind of
    thing.
  */
  const add = async () => {
    const said = text.trim()
    if (!said || busy) return
    setBusy(true)
    const drafts = readTasks(said, members)
    const one: DraftTask[] = drafts.length ? drafts : [{ text: said }]
    await addTasks(teamId, one, me.id)
    setBusy(false)
    setText('')
    setAdding(false)
    onChanged()
  }

  return (
    <div className="pb-24">
      <div className="mt-3 flex items-center gap-2">
        <p className="text-[12px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
          Outstanding {outstanding.length > 0 && outstanding.length}
        </p>
        <button
          type="button"
          onClick={() => setAdding((on) => !on)}
          className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[13px] text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
        >
          <Plus size={13} />
          Add a task
        </button>
      </div>

      {adding && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void add()
              if (event.key === 'Escape') setAdding(false)
            }}
            placeholder="What needs doing? @name for who, and say when in your own words."
            aria-label="A new task"
            className="min-w-0 flex-1 rounded-full border border-[var(--color-line)] bg-[var(--color-hover)] px-3 py-2 text-[14px] outline-none"
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={busy || !text.trim()}
            className="rounded-full bg-[var(--color-accent)] px-3 py-2 text-[13px] font-medium text-white disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}

      {outstanding.length === 0 ? (
        <p className="py-10 text-center text-[15px] text-[var(--color-faint)]">
          Nothing outstanding. Say what needs doing in the chat and it turns up here.
        </p>
      ) : (
        <ul className="mt-1 border-t border-[var(--color-line)]">
          {outstanding.map((task) => (
            <Row key={task.id} task={task} onChanged={onChanged} />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <section className="mt-6 border-t border-[var(--color-line)] pt-3">
          <button
            type="button"
            onClick={() => setShowDone((on) => !on)}
            aria-expanded={showDone}
            className="text-[13px] text-[var(--color-faint)] hover:text-[var(--color-ink)]"
          >
            Done {done.length}
          </button>
          {showDone && (
            <ul className="mt-1 border-t border-[var(--color-line)]">
              {done.map((task) => (
                <Row key={task.id} task={task} onChanged={onChanged} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

/**
 * One piece of work: the tick, what it is, who has it, when it is for.
 *
 * The date is printed in the words it was written in — "Friday", "end of
 * the month" — because which Friday was meant is not something this app
 * knows, and a wrong date on somebody else's task is worse than a vague one.
 */
function Row({ task, onChanged }: { task: TeamTask; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)

  const run = async (what: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    await what()
    setBusy(false)
    onChanged()
  }

  return (
    <li className="flex items-start gap-2.5 border-b border-[var(--color-line)] py-2.5 last:border-b-0">
      <button
        type="button"
        onClick={() => void run(() => setTaskDone(task.id, !task.done))}
        aria-label={task.done ? `Put “${task.text}” back` : `Tick “${task.text}”`}
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--color-faint)] hover:bg-[var(--color-hover)] hover:text-[var(--color-accent)]"
      >
        {task.done ? <CircleCheck size={16} /> : <Circle size={16} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-[15px] leading-snug ${task.done ? 'text-[var(--color-faint)] line-through' : ''}`}>
          {task.text}
        </p>
        {(task.assigneeName || task.due) && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px]">
            {task.assigneeName && (
              <span className="text-[var(--color-muted)]">{task.assigneeName}</span>
            )}
            {task.due && <span className="text-[var(--color-muted)]">{task.due}</span>}
          </p>
        )}
      </div>
      {asking ? (
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => void run(() => deleteTask(task.id))}
            className="rounded-md bg-[var(--color-danger)] px-2 py-1 text-[12px] text-white"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => setAsking(false)}
            className="rounded-md px-2 py-1 text-[12px] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
          >
            Keep
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          aria-label={`Delete “${task.text}”`}
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--color-faint)] hover:bg-[var(--color-hover)] hover:text-[var(--color-danger)]"
        >
          <Trash2 size={14} />
        </button>
      )}
    </li>
  )
}

function Tab({
  on,
  onPress,
  icon,
  label,
  count,
}: {
  on: boolean
  onPress: () => void
  icon: React.ReactNode
  label: string
  count?: number
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onPress}
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[14px] ${
        on
          ? 'border-[var(--color-accent)] font-medium text-[var(--color-ink)]'
          : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)]'
      }`}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span className="text-[12px] text-[var(--color-faint)]">{count}</span>
      )}
    </button>
  )
}
