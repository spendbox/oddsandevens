'use client'

import {
  Check,
  ChevronDown,
  Circle,
  CircleCheck,
  Copy,
  CornerUpLeft,
  ListChecks,
  LoaderCircle,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Settings2,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  keepOnlyReal,
  mergeTasks,
  readTasks,
  type DraftTask,
  type Member,
} from '@/lib/team-chat'
import { takePendingTeam } from '@/lib/mode'
import { markSeen, unreadIn, useSeen } from '@/lib/team-unread'
import {
  addMember,
  addTasks,
  createTeam,
  deleteMessage,
  deleteTask,
  deleteTeam,
  editMessage,
  isAdmin,
  myTeams,
  removeMember,
  renameTeam,
  sendMessage,
  setMemberRole,
  setTaskDone,
  teamMembers,
  teamMessages,
  teamPulse,
  teamTasks,
  type Pulse,
  type Team,
  type TeamMessage,
  type TeamTask,
} from '@/lib/teams'
import { stamp } from '@/lib/when'
import { useDismiss } from './dismiss'
import MentionField from './mention-field'
import Sheet from './sheet'

/**
 * A team: a chat, and the work that comes out of it.
 *
 * ## Why a chat rather than a form
 *
 * Because nobody opens a task manager to write down a task — the same
 * observation the Actions tab is built on, pointed at a group instead of a
 * person. Work gets agreed in a sentence somebody types to somebody else:
 * "@ada can you send the service charge figures by Friday". So that is the
 * input, and the board is what comes out of it.
 *
 * ## The rule this screen lives or dies by
 *
 * A task has to be a thing somebody actually said. See `lib/team-chat.ts`,
 * where the device's own reading, the guard against invention and the
 * mention rules all live as pure functions with unit tests. An invented job
 * with somebody else's name on it is the failure that would make a team
 * stop reading the list.
 *
 * ## Answering somebody is how a task finds its owner
 *
 * A reply carries who it is answering, so "yes, by Thursday" written under
 * Ada's question is Ada's job without anybody typing her name again. An @
 * in the line always wins over it: what somebody wrote beats what the app
 * worked out.
 *
 * ## What is shared and what is not
 *
 * This, and nothing else. Notes stay exactly as private as they were. A
 * team sees its own chat and its own tasks, enforced by row-level security
 * in the database rather than by this file — see 0007 and 0008.
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
  /** Which of the panels is open: all teams, all members, or one member. */
  const [sheet, setSheet] = useState<'teams' | 'members' | 'settings' | null>(null)
  const [who, setWho] = useState<Member | null>(null)
  /**
   * When each team last had something said in it, for the dots in the list
   * of all of them. Asked for when that list is opened rather than kept up
   * to date: it is read for as long as a sheet is on screen.
   */
  const [pulses, setPulses] = useState<Pulse[]>([])

  useEffect(() => {
    if (!me) return
    let cancelled = false
    void (async () => {
      const { teams: mine, problem: why } = await myTeams()
      if (cancelled) return
      setTeams(mine)
      /*
        The team the mark on the notes was about, if that is how we got
        here — landing in whichever team happens to be first is how a
        notification teaches people to ignore it. Taken rather than read,
        so it cannot apply twice.
      */
      const wanted = takePendingTeam()
      setTeamId((current) => {
        if (wanted && mine.some((team) => team.id === wanted)) return wanted
        return current ?? mine[0]?.id ?? null
      })
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
    that catches up within ten seconds is one nobody notices is polling. It
    stops while the tab is in the background, because a message nobody is
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
      /*
        Read up to the last message on screen, not up to "now": one that
        arrives while somebody is reading has not been read, and marking it
        so is how an unread message disappears without ever being seen.
      */
      const newest = said.length ? said[said.length - 1].createdAt : 0
      if (newest) markSeen(teamId, newest)
    }
    void read()
    const id = setInterval(() => void read(), POLL_MS)
    const onVisible = () => void read()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [teamId])

  const team = teams.find((t) => t.id === teamId) ?? null
  const outstanding = tasks.filter((task) => !task.done)
  const admin = !!me && !!team && isAdmin(members, me.id, team.owner)

  const refresh = async () => {
    if (!teamId) return
    const [said, work, people] = await Promise.all([
      teamMessages(teamId),
      teamTasks(teamId),
      teamMembers(teamId),
    ])
    setMessages(said)
    setTasks(work)
    setMembers(people)
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
    return (
      <NoTeamYet
        me={me}
        onMade={(made) => {
          setTeams([made])
          setTeamId(made.id)
        }}
      />
    )
  }

  return (
    <div className="pb-4">
      {/*
        Which team, and everything about it. Sticky, because on a long chat
        the one thing you always need is a way back out of it — and because
        the tabs below are how you get from the talking to the work.
      */}
      <div className="sticky top-0 z-20 -mx-4 bg-[var(--color-paper)] px-4 pt-2 sm:-mx-8 sm:px-8">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setSheet('teams')
              void teamPulse().then(setPulses)
            }}
            className="flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1.5 text-[15px] font-medium hover:bg-[var(--color-hover)]"
          >
            <Users size={15} className="shrink-0 text-[var(--color-faint)]" />
            <span className="truncate">{team.name}</span>
            <ChevronDown size={14} className="shrink-0 text-[var(--color-faint)]" />
          </button>
          <button
            type="button"
            onClick={() => setSheet('settings')}
            aria-label="This team"
            title="This team"
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
          >
            <Settings2 size={16} />
          </button>
        </div>

        <div
          role="tablist"
          aria-label="This team"
          className="flex items-stretch gap-1 border-b border-[var(--color-line)]"
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
      </div>

      {view === 'chat' ? (
        <Chat
          me={me}
          team={team}
          admin={admin}
          members={members}
          messages={messages}
          onChanged={() => void refresh()}
          onMembers={() => setSheet('members')}
          onWho={setWho}
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

      {sheet === 'teams' && (
        <Sheet title="Your teams" onClose={() => setSheet(null)}>
          <AllTeams
            teams={teams}
            current={team.id}
            me={me}
            pulses={pulses}
            onPick={(id) => {
              setTeamId(id)
              setSheet(null)
            }}
            onMade={(made) => {
              setTeams((all) => [...all, made])
              setTeamId(made.id)
              setSheet(null)
            }}
          />
        </Sheet>
      )}

      {sheet === 'members' && (
        <Sheet title={`${members.length} in ${team.name}`} onClose={() => setSheet(null)}>
          <AllMembers
            members={members}
            teamId={team.id}
            admin={admin}
            onWho={(member) => {
              setSheet(null)
              setWho(member)
            }}
            onChanged={() => void refresh()}
          />
        </Sheet>
      )}

      {sheet === 'settings' && (
        <Sheet title={team.name} onClose={() => setSheet(null)}>
          <TeamSettings
            team={team}
            admin={admin}
            owner={team.owner === me.id}
            onRenamed={(name) => {
              setTeams((all) => all.map((t) => (t.id === team.id ? { ...t, name } : t)))
            }}
            onDeleted={() => {
              const left = teams.filter((t) => t.id !== team.id)
              setTeams(left)
              setTeamId(left[0]?.id ?? null)
              setSheet(null)
            }}
          />
        </Sheet>
      )}

      {who && (
        <Sheet title={who.name} onClose={() => setWho(null)}>
          <OneMember
            member={who}
            admin={admin}
            isOwner={who.userId === team.owner}
            isMe={who.userId === me.id}
            onChanged={() => {
              setWho(null)
              void refresh()
            }}
          />
        </Sheet>
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

/**
 * Making a team, from a name typed into a field that goes away again.
 *
 * A press outside puts the field away without making anything — the same
 * thing a press outside means everywhere else here, and the answer to
 * having opened it by accident.
 */
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
  const field = useRef<HTMLSpanElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useDismiss(() => setNaming(false), field, button)

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
        ref={button}
        type="button"
        onClick={() => setNaming(true)}
        className={
          primary
            ? 'rounded-full bg-[var(--color-accent)] px-4 py-2 text-[14px] font-medium text-white'
            : 'flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-[14px] text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]'
        }
      >
        {!primary && <Plus size={14} />}
        New team
      </button>
    )
  }

  return (
    <span ref={field} className="flex items-center gap-1">
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
        className="shrink-0 rounded-full bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
      >
        {busy ? '…' : 'Make it'}
      </button>
      {problem && <span className="text-[12px] text-[var(--color-danger)]">{problem}</span>}
    </span>
  )
}

/* -------------------------------------------------------- all your teams */

function AllTeams({
  teams,
  current,
  me,
  pulses,
  onPick,
  onMade,
}: {
  teams: Team[]
  current: string
  me: { id: string; email: string; name: string }
  /** When each team last had something said in it. */
  pulses: Pulse[]
  onPick: (id: string) => void
  onMade: (team: Team) => void
}) {
  const seen = useSeen()
  const unread = new Set(unreadIn(pulses, seen).map((pulse) => pulse.teamId))
  return (
    <>
      <ul>
        {teams.map((team) => (
          <li key={team.id}>
            <button
              type="button"
              onClick={() => onPick(team.id)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left hover:bg-[var(--color-hover)]"
            >
              {/*
                A dot for a team with something new in it. A dot rather
                than a number: how many messages you have not read is not
                a thing anybody acts on, and "there is something here" is.
              */}
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  unread.has(team.id) ? 'bg-[var(--color-accent)]' : 'bg-transparent'
                }`}
              />
              <span
                className={`min-w-0 flex-1 truncate text-[14px] ${
                  unread.has(team.id) ? 'font-medium' : ''
                }`}
              >
                {team.name}
                {unread.has(team.id) && (
                  <span className="sr-only"> — has something new in it</span>
                )}
              </span>
              {team.id === current && <Check size={15} className="shrink-0 text-[var(--color-accent)]" />}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-1 border-t border-[var(--color-line)] pt-1">
        <NewTeam me={me} onMade={onMade} />
      </div>
    </>
  )
}

/* ------------------------------------------------------------- the people */

function AllMembers({
  members,
  teamId,
  admin,
  onWho,
  onChanged,
}: {
  members: Member[]
  teamId: string
  admin: boolean
  onWho: (member: Member) => void
  onChanged: () => void
}) {
  return (
    <>
      <ul>
        {members.map((member) => (
          <li key={member.email}>
            <button
              type="button"
              onClick={() => onWho(member)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left hover:bg-[var(--color-hover)]"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-hover)] text-[11px] font-medium text-[var(--color-muted)]">
                {member.name.trim().charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px]">{member.name}</span>
                <span className="block truncate text-[12px] text-[var(--color-faint)]">
                  {member.email}
                  {!member.userId && ' · has not signed in yet'}
                </span>
              </span>
              {member.admin && (
                <span className="shrink-0 text-[11px] text-[var(--color-muted)]">Admin</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {admin && (
        <div className="mt-1 border-t border-[var(--color-line)] pt-2">
          <AddSomebody teamId={teamId} onDone={onChanged} />
        </div>
      )}
    </>
  )
}

/**
 * One person, and what an admin may do about them.
 *
 * The owner cannot be removed or demoted by anybody, including themselves:
 * a team with no admin of last resort is a team nobody can ever change
 * again. The database refuses it as well — this is only where it is said.
 */
function OneMember({
  member,
  admin,
  isOwner,
  isMe,
  onChanged,
}: {
  member: Member
  admin: boolean
  isOwner: boolean
  isMe: boolean
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | undefined>()
  const [asking, setAsking] = useState(false)

  const run = async (what: () => Promise<string | undefined>) => {
    if (busy || !member.id) return
    setBusy(true)
    const why = await what()
    setBusy(false)
    if (why) {
      setProblem(why)
      return
    }
    onChanged()
  }

  return (
    <div>
      <p className="text-[13px] text-[var(--color-muted)]">{member.email}</p>
      <p className="mt-0.5 text-[12px] text-[var(--color-faint)]">
        {isOwner
          ? 'Made this team. Cannot be removed.'
          : member.admin
            ? 'An admin: can add and remove people.'
            : 'A member.'}
        {!member.userId && ' Has not signed in yet.'}
      </p>

      {admin && !isOwner && (
        <div className="mt-3 space-y-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => setMemberRole(member.id ?? '', !member.admin))}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-[14px] hover:bg-[var(--color-hover)] disabled:opacity-50"
          >
            <Users size={15} className="text-[var(--color-muted)]" />
            {member.admin ? 'Take away admin' : 'Make them an admin'}
          </button>
          {asking ? (
            <div className="rounded-lg bg-[var(--color-hover)] p-2.5">
              <p className="text-[13px]">
                Remove {member.name} from this team? They lose the chat and the board; the tasks
                with their name on stay.
              </p>
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => removeMember(member.id ?? ''))}
                  className="rounded-md bg-[var(--color-danger)] px-2.5 py-1.5 text-[13px] text-white disabled:opacity-50"
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => setAsking(false)}
                  className="rounded-md px-2.5 py-1.5 text-[13px] text-[var(--color-muted)]"
                >
                  Keep them
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAsking(true)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-[14px] text-[var(--color-danger)] hover:bg-[var(--color-hover)]"
            >
              <Trash2 size={15} />
              Remove from the team
            </button>
          )}
        </div>
      )}

      {!admin && !isMe && (
        <p className="mt-3 text-[12px] text-[var(--color-faint)]">
          Only an admin can change who is in a team.
        </p>
      )}
      {problem && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{problem}</p>}
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
    <div>
      <div className="flex items-center gap-1.5">
        <input
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
          className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
        >
          <UserPlus size={13} />
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

/* ----------------------------------------------------------- the settings */

/**
 * Renaming a team, sharing the way in, and — last and hardest — deleting it.
 *
 * Deleting takes the chat, the board and the membership with it and cannot
 * be undone from inside the app, so it asks for the team's name to be typed
 * out. Not a second "are you sure": a confirmation somebody can dismiss by
 * pressing the same place twice is one they will, and the point of typing
 * the name is that you cannot do it by accident.
 */
function TeamSettings({
  team,
  admin,
  owner,
  onRenamed,
  onDeleted,
}: {
  team: Team
  admin: boolean
  owner: boolean
  onRenamed: (name: string) => void
  onDeleted: () => void
}) {
  const [name, setName] = useState(team.name)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [problem, setProblem] = useState<string | undefined>()
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [copied, setCopied] = useState(false)

  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/t/${team.id}`

  const rename = async () => {
    if (busy || name.trim() === team.name) return
    setBusy(true)
    const why = await renameTeam(team.id, name)
    setBusy(false)
    setProblem(why)
    if (why) return
    onRenamed(name.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const destroy = async () => {
    if (busy) return
    setBusy(true)
    const why = await deleteTeam(team.id)
    setBusy(false)
    if (why) {
      setProblem(why)
      return
    }
    onDeleted()
  }

  return (
    <div>
      {admin ? (
        <label className="block">
          <span className="text-[12px] text-[var(--color-faint)]">What it is called</span>
          <span className="mt-1 flex items-center gap-1.5">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void rename()
              }}
              maxLength={40}
              aria-label="Team name"
              className="min-w-0 flex-1 rounded-full border border-[var(--color-line)] bg-[var(--color-hover)] px-3 py-1.5 text-[14px] outline-none"
            />
            <button
              type="button"
              onClick={() => void rename()}
              disabled={busy || !name.trim() || name.trim() === team.name}
              className="shrink-0 rounded-full px-3 py-1.5 text-[13px] text-[var(--color-muted)] hover:bg-[var(--color-hover)] disabled:opacity-40"
            >
              {saved ? <Check size={14} className="text-[var(--color-good)]" /> : 'Rename'}
            </button>
          </span>
        </label>
      ) : (
        <p className="text-[13px] text-[var(--color-muted)]">
          Only an admin can rename or delete this team.
        </p>
      )}

      {/*
        The way in, for somebody who has been added and has not signed in
        yet. It is a link to a sign-in page and not a way into the team:
        being added by an admin is still the only thing that makes somebody
        a member, so a link that went astray gets whoever has it exactly as
        far as a sign-in form.
      */}
      <div className="mt-4">
        <p className="text-[12px] text-[var(--color-faint)]">A link to send them</p>
        <div className="mt-1 flex items-center gap-1">
          <input
            readOnly
            value={link}
            aria-label="Link to this team"
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-hover)] px-2 py-1.5 text-[12px] outline-none"
          />
          <button
            type="button"
            aria-label="Copy the link"
            onClick={() => {
              navigator.clipboard?.writeText(link).then(
                () => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                },
                () => {
                  // Refused. The link is on screen and selectable.
                },
              )
            }}
            className="shrink-0 rounded-lg p-2 text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
          >
            {copied ? <Check size={15} className="text-[var(--color-good)]" /> : <Copy size={15} />}
          </button>
        </div>
        <p className="mt-1 text-[12px] text-[var(--color-faint)]">
          It opens a page to sign in or create an account. They still have to have been added by
          their email address — the link is not a way into the team.
        </p>
      </div>

      {owner && (
        <div className="mt-5 border-t border-[var(--color-line)] pt-3">
          {deleting ? (
            <>
              <p className="text-[13px]">
                This takes the chat, the board and everybody&rsquo;s place in it. Type{' '}
                <span className="font-medium">{team.name}</span> to be sure.
              </p>
              <div className="mt-2 flex items-center gap-1.5">
                <input
                  autoFocus
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  aria-label="Type the team name to delete it"
                  placeholder={team.name}
                  className="min-w-0 flex-1 rounded-full border border-[var(--color-line)] bg-[var(--color-hover)] px-3 py-1.5 text-[14px] outline-none"
                />
                <button
                  type="button"
                  onClick={() => void destroy()}
                  disabled={busy || typed.trim() !== team.name}
                  className="shrink-0 rounded-full bg-[var(--color-danger)] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-40"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(false)}
                  className="shrink-0 rounded-full px-2 py-1.5 text-[13px] text-[var(--color-muted)]"
                >
                  Keep
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setDeleting(true)}
              className="flex items-center gap-2 text-[14px] text-[var(--color-danger)]"
            >
              <Trash2 size={15} />
              Delete this team
            </button>
          )}
        </div>
      )}
      {problem && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{problem}</p>}
    </div>
  )
}

/* ----------------------------------------------------------------- chat */

function Chat({
  me,
  team,
  admin,
  members,
  messages,
  onChanged,
  onMembers,
  onWho,
}: {
  me: { id: string; email: string; name: string }
  team: Team
  admin: boolean
  members: Member[]
  messages: TeamMessage[]
  onChanged: () => void
  onMembers: () => void
  onWho: (member: Member) => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState<DraftTask[] | null>(null)
  const [problem, setProblem] = useState<string | undefined>()
  /** What is being answered, and what is being corrected. One at a time. */
  const [replying, setReplying] = useState<TeamMessage | null>(null)
  const [editing, setEditing] = useState<TeamMessage | null>(null)
  const [draft, setDraft] = useState('')
  const foot = useRef<HTMLDivElement>(null)

  useEffect(() => {
    foot.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  /**
   * Sends the message, and writes down the work in it.
   *
   * The message is saved first and separately: it is what somebody said, it
   * is the record, and it must not be lost because the reading of it
   * failed. Everything after is best effort — the device's own reading
   * always runs, the model is asked only where a key is configured, and
   * anything it returns is checked against the words of the message before
   * it is kept.
   */
  const send = async () => {
    const said = text.trim()
    if (!said || busy) return
    setBusy(true)
    setProblem(undefined)
    setMade(null)

    const answered = replying
    const { message, problem: why } = await sendMessage(
      team.id,
      { id: me.id, name: me.name },
      said,
      answered?.id,
    )
    if (!message) {
      setBusy(false)
      setProblem(why ?? 'That did not send.')
      return
    }
    setText('')
    setReplying(null)
    onChanged()

    /*
      Who this is for, when the line does not say. Answering Ada's question
      makes it Ada's job — an @ in the line always wins, because what
      somebody wrote beats what the app worked out.
    */
    const answering =
      answered && answered.author !== me.id
        ? members.find((member) => member.userId === answered.author)
        : undefined

    let drafts = readTasks(said, members, answering)

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
          const who =
            members.find((m) => m.name.toLowerCase() === row.who.trim().toLowerCase()) ?? answering
          return {
            text: row.text,
            ...(who?.userId ? { assignee: who.userId } : {}),
            ...(who ? { assigneeName: who.name } : {}),
            ...(row.due ? { due: row.due } : {}),
          }
        })
        // The guard: anything made of words the message did not contain is
        // thrown away here, and this is why the board can be trusted.
        drafts = mergeTasks(drafts, keepOnlyReal(fromModel, said))
      }
    } catch {
      // No key, no network, or a refusal. The device's own reading stands.
    }

    if (drafts.length) {
      const why2 = await addTasks(team.id, drafts, me.id, message.id)
      if (why2) setProblem(why2)
      else setMade(drafts)
      onChanged()
    }
    setBusy(false)
  }

  const saveEdit = async () => {
    if (!editing || busy) return
    setBusy(true)
    const why = await editMessage(editing.id, draft)
    setBusy(false)
    setProblem(why)
    if (why) return
    setEditing(null)
    onChanged()
  }

  const byId = (id: string) => messages.find((message) => message.id === id)

  return (
    <div>
      {/* Who is in it. A press opens the list; the + adds somebody. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-b border-[var(--color-line)] pb-2 text-[12px] text-[var(--color-faint)]">
        {members.slice(0, 4).map((member) => (
          <button
            key={member.email}
            type="button"
            onClick={() => onWho(member)}
            className="rounded-full bg-[var(--color-hover)] px-2 py-1 hover:text-[var(--color-ink)]"
          >
            {member.name}
            {!member.userId && ' ·'}
          </button>
        ))}
        <button
          type="button"
          onClick={onMembers}
          className="rounded-full px-2 py-1 hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
        >
          {members.length > 4 ? `+${members.length - 4} more` : 'All'}
        </button>
        {admin && (
          <button
            type="button"
            onClick={onMembers}
            aria-label="Add somebody to this team"
            className="flex items-center gap-1 rounded-full px-2 py-1 hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]"
          >
            <UserPlus size={13} />
            Add
          </button>
        )}
      </div>

      <ul className="mt-3 space-y-3">
        {messages.length === 0 && (
          <li className="py-8 text-center text-[14px] text-[var(--color-faint)]">
            Nothing said yet. Type what needs doing and it turns into work below.
          </li>
        )}
        {messages.map((message) => {
          const mine = message.author === me.id
          const answered = message.replyTo ? byId(message.replyTo) : null
          return (
            <li key={message.id} className="group flex gap-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-hover)] text-[11px] font-medium text-[var(--color-muted)]">
                {(message.authorName || '?').trim().charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-[var(--color-faint)]">
                  {mine ? 'You' : message.authorName || 'Somebody'}
                  {' · '}
                  {stamp(message.createdAt)}
                  {message.editedAt ? ' · edited' : ''}
                </p>
                {/* What it is answering, quoted in one line above it. */}
                {answered && (
                  <p className="mt-0.5 truncate border-l-2 border-[var(--color-line)] pl-2 text-[12px] text-[var(--color-faint)]">
                    {answered.authorName}: {answered.body}
                  </p>
                )}
                {editing?.id === message.id ? (
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void saveEdit()
                        if (event.key === 'Escape') setEditing(null)
                      }}
                      aria-label="Correct this message"
                      className="min-w-0 flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-hover)] px-2 py-1.5 text-[14px] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void saveEdit()}
                      className="shrink-0 rounded-md px-2 py-1 text-[13px] text-[var(--color-accent)]"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      aria-label="Stop correcting"
                      className="shrink-0 rounded-md p-1 text-[var(--color-muted)]"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <p className="pad-serif text-[15px] leading-relaxed whitespace-pre-wrap">
                    {message.body}
                  </p>
                )}

                {/*
                  Reply, correct, take down. Always there below `sm`: a
                  control that appears on hover does not exist on a phone,
                  which is a rule this app has paid for twice.
                */}
                {editing?.id !== message.id && (
                  <p className="mt-0.5 flex items-center gap-2 text-[12px] text-[var(--color-faint)] sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => setReplying(message)}
                      className="flex items-center gap-1 hover:text-[var(--color-ink)]"
                    >
                      <CornerUpLeft size={12} />
                      Reply
                    </button>
                    {mine && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(message)
                          setDraft(message.body)
                        }}
                        className="flex items-center gap-1 hover:text-[var(--color-ink)]"
                      >
                        <Pencil size={12} />
                        Edit
                      </button>
                    )}
                    {(mine || admin) && (
                      <button
                        type="button"
                        onClick={() => void deleteMessage(message.id).then(onChanged)}
                        className="flex items-center gap-1 hover:text-[var(--color-danger)]"
                      >
                        <Trash2 size={12} />
                        Delete
                      </button>
                    )}
                  </p>
                )}
              </div>
            </li>
          )
        })}
        <div ref={foot} />
      </ul>

      {made && made.length > 0 && (
        <p className="mt-3 rounded-xl bg-[var(--color-accent-soft)] px-3 py-2 text-[13px] text-[var(--color-ink)]">
          {made.length === 1 ? 'One thing' : `${made.length} things`} added to Actions:{' '}
          {made.map((task) => task.text).join('; ')}
        </p>
      )}
      {problem && <p className="mt-2 text-[13px] text-[var(--color-danger)]">{problem}</p>}

      {/*
        The box.

        Sticky rather than fixed, which is the fix for it ending up under
        the bottom of the screen: a fixed element is positioned against the
        window and has to be told about the keyboard, the safe area and
        every browser's idea of where the bottom is. A sticky one is in the
        page, so it sits at the bottom of what is on screen and the browser
        does the arithmetic.
      */}
      <div className="sticky bottom-0 -mx-4 mt-3 border-t border-[var(--color-line)] bg-[var(--color-paper)] px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:-mx-8 sm:px-8">
        {replying && (
          <p className="mb-1 flex items-center gap-1.5 text-[12px] text-[var(--color-faint)]">
            <CornerUpLeft size={12} />
            <span className="min-w-0 flex-1 truncate">
              Answering {replying.authorName}: {replying.body}
            </span>
            <button
              type="button"
              onClick={() => setReplying(null)}
              aria-label="Stop answering"
              className="shrink-0 rounded p-0.5 hover:text-[var(--color-ink)]"
            >
              <X size={13} />
            </button>
          </p>
        )}
        <div className="flex items-end gap-2">
          <MentionField
            value={text}
            onChange={setText}
            members={members}
            multiline
            onSubmit={() => void send()}
            label="Say what needs doing"
            placeholder="What needs doing? Use @ to give it to somebody."
            className="pad-serif max-h-32 min-h-[2.75rem] w-full resize-none rounded-2xl border border-[var(--color-line)] bg-[var(--color-hover)] px-3 py-2.5 text-[15px] outline-none placeholder:text-[var(--color-faint)]"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!text.trim() || busy}
            aria-label="Send"
            className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-white disabled:opacity-40"
          >
            {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
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
  /** Which list is on. Side by side, because both are the same question. */
  const [showing, setShowing] = useState<'open' | 'done'>('open')

  const outstanding = tasks.filter((task) => !task.done)
  const done = tasks.filter((task) => task.done)
  const listed = showing === 'open' ? outstanding : done

  /*
    By hand, which every list of work needs however well the chat is read:
    somebody remembers something in the corridor, and asking them to go and
    phrase it as a chat message is asking them not to bother. It takes the
    same @ and the same date words a message does — one set of rules, so a
    task typed here and one read out of the chat are the same kind of thing.
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
    <div className="pb-8">
      {/* Outstanding and done, side by side: what is left, and what was. */}
      <div className="mt-3 flex items-center gap-1">
        <Pill on={showing === 'open'} onPress={() => setShowing('open')} label="Outstanding" count={outstanding.length} />
        <Pill on={showing === 'done'} onPress={() => setShowing('done')} label="Done" count={done.length} />
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
        <div className="mt-2 flex items-end gap-1.5">
          <MentionField
            value={text}
            onChange={setText}
            members={members}
            onSubmit={() => void add()}
            label="A new task"
            placeholder="What needs doing? @ for who, and say when in your own words."
            className="w-full rounded-full border border-[var(--color-line)] bg-[var(--color-hover)] px-3 py-2 text-[14px] outline-none"
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={busy || !text.trim()}
            className="shrink-0 rounded-full bg-[var(--color-accent)] px-3 py-2 text-[13px] font-medium text-white disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}

      {listed.length === 0 ? (
        <p className="py-10 text-center text-[15px] text-[var(--color-faint)]">
          {showing === 'open'
            ? 'Nothing outstanding. Say what needs doing in the chat and it turns up here.'
            : 'Nothing finished yet.'}
        </p>
      ) : (
        <ul className="mt-2 border-t border-[var(--color-line)]">
          {listed.map((task) => (
            <Row key={task.id} task={task} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * One piece of work: the tick, what it is, who has it, when it is for.
 *
 * The date is printed in the words it was written in — "Friday", "end of
 * the month" — because which Friday was meant is not something this app
 * knows, and a wrong date on somebody else's task is worse than a vague
 * one.
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
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-[var(--color-muted)]">
            {task.assigneeName && <span>{task.assigneeName}</span>}
            {task.due && <span>{task.due}</span>}
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

function Pill({
  on,
  onPress,
  label,
  count,
}: {
  on: boolean
  onPress: () => void
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={on}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] ${
        on
          ? 'bg-[var(--color-hover)] font-medium text-[var(--color-ink)]'
          : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
      }`}
    >
      {label}
      {count > 0 && <span className="text-[12px] text-[var(--color-faint)]">{count}</span>}
    </button>
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
