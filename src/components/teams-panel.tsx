'use client'

import {
  Check,
  ChevronDown,
  Circle,
  CircleCheck,
  Copy,
  CornerUpLeft,
  ListChecks,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Settings2,
  Star,
  Trash2,
  Undo2,
  UserPlus,
  Users,
  X,
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
  setTaskAssignee,
  setTaskDone,
  setTaskDue,
  setTaskText,
  teamMembers,
  teamMessages,
  teamPulse,
  teamTasks,
  type Pulse,
  type Team,
  type TeamMessage,
  type TeamTask,
} from '@/lib/teams'
import { stamp, when } from '@/lib/when'
import ComposeSheet from './compose-sheet'
import { TeamIcon } from './doc-icon'
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
/** How long an undo stays on offer, the same as it is on your own Actions. */
const UNDO_SECONDS = 5
/**
 * How much of a long message a card shows before it offers the rest.
 *
 * Three lines, which is where every chat app that has thought about this
 * lands. Six was still most of a phone screen for one message, which is
 * the complaint: the point of folding is that the next person's answer is
 * visible without scrolling, and that needs the fold to be short.
 */
const CLAMP_LINES = 3
const CLAMP_CHARS = 200

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
  /**
   * Looking for something somebody said, or something on the board.
   *
   * On the device, over what is already here, which is the whole of it: a
   * team's chat and its board are both already in memory — they are
   * polled every ten seconds — so asking the server to search them would
   * be a round trip for an answer sitting in a variable. It is the same
   * bargain the notes make, and the same shape: a button at the end of
   * the row of tabs rather than a field taking a row of every screen.
   */
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
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
      <div
        /*
          Underneath the app's own bar rather than on top of it. The offset
          is measured by the notes screen and written to `--pad-header`, so
          it stays right when a long name wraps the greeting onto two
          lines; the fallback is for the one render before it is measured.
        */
        /*
          The fallback is deliberately not zero.

          `--pad-header` is measured off the app's own bar, and when the
          measurement failed — which it did, for two versions, because the
          ref was never attached — this stuck at `0px`: directly under a
          sticky bar with a higher z-index, opaque, and the same height.
          The team's name, its ⚙ and the Chat/Actions tabs were invisible
          and unpressable the moment the page was scrolled at all, which
          in a chat is always. That is what "I cannot edit or delete a
          team" looked like.
          A fallback that is roughly right leaves the bar slightly too low
          if it is ever used; a fallback of zero hides it completely, and
          hiding it is the failure nobody can see the cause of.
        */
        style={{ top: 'var(--pad-header, 4.5rem)' }}
        className="sticky z-10 -mx-4 bg-[var(--color-paper)] px-4 pt-2 sm:-mx-8 sm:px-8"
      >
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setSheet('teams')
              void teamPulse().then(setPulses)
            }}
            className="flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1.5 text-[15px] font-semibold hover:bg-[var(--color-hover)]"
          >
            {/*
              The team's own picture, worked out from its name the same way
              a note's is worked out from its title — a table of words, no
              model, the same answer every time. With three teams in the
              list it is what tells them apart before the name is read.
            */}
            <TeamIcon name={team.name} size={15} className="shrink-0 text-[var(--color-accent)]" />
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
          {/*
            Searching, at the end of the row and lined up the way it is on
            your own notes. It looks in whichever of the two you are in —
            one box that searches two collections is the fastest way to
            make somebody distrust both, and here the tab you are on is
            what says which.
          */}
          <button
            type="button"
            aria-label={view === 'chat' ? 'Search this chat' : 'Search the board'}
            aria-expanded={searching}
            onClick={() => {
              setSearching((on) => !on)
              setQuery('')
            }}
            className={`-mb-px ml-auto flex items-center justify-center border-b-2 px-3 py-2.5 ${
              searching
                ? 'border-[var(--color-accent)] text-[var(--color-ink)]'
                : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)]'
            }`}
          >
            <Search size={15} />
          </button>
        </div>

        {searching && (
          <div className="flex items-center gap-1 py-2">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setSearching(false)
                  setQuery('')
                }
              }}
              placeholder={
                view === 'chat' ? 'Everything anybody has said' : 'Everything on the board'
              }
              aria-label={view === 'chat' ? 'Search this chat' : 'Search the board'}
              className="min-w-0 flex-1 rounded-full border border-[var(--color-accent)] bg-[var(--color-hover)] px-4 py-2.5 text-[15px] outline-none placeholder:text-[var(--color-faint)]"
            />
            <button
              type="button"
              onClick={() => {
                setSearching(false)
                setQuery('')
              }}
              aria-label="Stop searching"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
            >
              <X size={18} />
            </button>
          </div>
        )}
      </div>

      {view === 'chat' ? (
        <Chat
          me={me}
          team={team}
          admin={admin}
          members={members}
          messages={messages}
          query={searching ? query : ''}
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
          query={searching ? query : ''}
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
    /*
      The one screen in this app that has to sell something, so it is
      allowed to be the one screen that raises its voice.

      Everything else here is a list somebody already wanted to look at.
      This is a person who has pressed Team and has no team, and every
      word of it was set in the same quiet grey as a timestamp — a
      paragraph nobody reads above a button nobody is sure about. The
      heading is a heading now and the sentence that says what a team is
      is set in the ink the notes are set in, with the small print kept
      small and kept underneath.
    */
    <div className="mt-6 rounded-xl border border-[var(--color-line)] p-5">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-accent-soft)]">
        <Users size={19} className="text-[var(--color-accent)]" />
      </span>
      <h2 className="pad-serif mt-3 text-[22px] font-semibold tracking-tight">Start a team</h2>
      <p className="mt-1.5 text-[15px] leading-relaxed font-medium text-[var(--color-ink)]">
        A team is a chat, and the work that comes out of it.
      </p>
      <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--color-muted)]">
        Type what needs doing the way you would say it —{' '}
        <span className="font-semibold text-[var(--color-ink)]">
          @ada send the figures by Friday
        </span>{' '}
        — and it turns up on the board with her name and the day against it.
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-faint)]">
        People are added by their email address. Your own notes are not shared with anybody.
      </p>
      <div className="mt-4">
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
            ? 'rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-[15px] font-semibold text-white'
            : 'flex w-full items-center gap-1.5 rounded-lg px-2 py-2 text-[14px] font-medium text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]'
        }
      >
        {!primary && <Plus size={14} />}
        New team
      </button>
    )
  }

  return (
    <span ref={field} className="flex items-center gap-1">
      {/*
        The icon changes as the name is typed, which is the whole of the
        introduction this idea needs: call it Finance and it is a
        banknote before the team exists. It is a table of words in
        `lib/doc-icon.ts`, so it costs nothing and is never waited for.
      */}
      <TeamIcon
        name={name}
        size={16}
        className={`shrink-0 ${name.trim() ? 'text-[var(--color-accent)]' : 'text-[var(--color-faint)]'}`}
      />
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
        className="min-w-0 flex-1 rounded-full border border-[var(--color-line)] bg-[var(--color-hover)] px-3 py-1.5 text-[14px] font-medium outline-none"
      />
      <button
        type="button"
        onClick={() => void make()}
        disabled={busy}
        className="shrink-0 rounded-full bg-[var(--color-accent)] px-3.5 py-1.5 text-[14px] font-semibold text-white disabled:opacity-50"
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
              <TeamIcon
                name={team.name}
                size={15}
                className="shrink-0 text-[var(--color-faint)]"
              />
              <span
                className={`min-w-0 flex-1 truncate text-[14px] ${
                  unread.has(team.id) ? 'font-semibold' : ''
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
                <Star
                  size={13}
                  aria-label="An admin"
                  className="shrink-0 text-[var(--color-faint)]"
                />
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
      <p className="mt-0.5 flex items-center gap-1 text-[12px] text-[var(--color-faint)]">
        {(member.admin || isOwner) && <Star size={11} />}
        {isOwner
          ? 'Made this team. An admin, and cannot be removed.'
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
  query,
  onChanged,
  onMembers,
  onWho,
}: {
  me: { id: string; email: string; name: string }
  team: Team
  admin: boolean
  members: Member[]
  messages: TeamMessage[]
  /** What is being looked for, or empty. Filtered here, on the device. */
  query: string
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
  /** A long message opened in full, because the card only shows the top of it. */
  const [reading, setReading] = useState<TeamMessage | null>(null)
  /** Whether the box is open. The bar below is what opens it. */
  const [writing, setWriting] = useState(false)
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
    setWriting(false)
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

  /*
    What is being looked for, matched against what was said and who said
    it. A reply is still quoted by the message it answers even when that
    message is filtered out, because `byId` reads the whole list — the
    thing you searched for keeps its context.
  */
  const wanted = query.trim().toLowerCase()
  const shown = wanted
    ? messages.filter((message) =>
        `${message.body} ${message.authorName}`.toLowerCase().includes(wanted),
      )
    : messages

  return (
    <div>
      {/* Who is in it. A press opens the list; the + adds somebody. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-b border-[var(--color-line)] pb-2 text-[12px] text-[var(--color-faint)]">
        {members.slice(0, 4).map((member) => (
          <button
            key={member.email}
            type="button"
            onClick={() => onWho(member)}
            className="flex items-center gap-1 rounded-full bg-[var(--color-hover)] px-2 py-1 hover:text-[var(--color-ink)]"
          >
            {member.name}
            {/*
              A star, and nothing louder. Who can remove people is worth
              knowing at a glance and is not worth a badge, a colour or a
              word — it is the sort of thing you notice when you go looking
              for it and never otherwise.
            */}
            {member.admin && <Star size={10} aria-label="An admin" />}
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

      {/*
        Each message on its own quiet card.

        They were bare lines with a name above them, three of them in a
        row from the same person reading as one long paragraph with the
        odd timestamp through it. A card is the smallest thing that says
        where one stops and the next starts — a faint fill and a corner,
        no border and no colour, because a chat is a page of writing and
        forty outlined boxes is a form.
      */}
      <ul className="mt-3 space-y-1.5">
        {shown.length === 0 && (
          <li className="py-8 text-center text-[14px] text-[var(--color-faint)]">
            {wanted
              ? 'Nobody has said anything matching that.'
              : 'Nothing said yet. Type what needs doing and it turns into work below.'}
          </li>
        )}
        {shown.map((message) => {
          const mine = message.author === me.id
          const answered = message.replyTo ? byId(message.replyTo) : null
          return (
            <li
              key={message.id}
              className="group flex gap-2.5 rounded-xl bg-[var(--color-hover)] px-2.5 py-2"
            >
              {/* The initial sits on the paper colour, or it disappears
                  into the card it is standing on. */}
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-paper)] text-[11px] font-medium text-[var(--color-muted)]">
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
                  /*
                    A box the size of the message, not a slot beside two
                    buttons.

                    It was a single-line input squeezed between Save and a
                    ×, inside a card that is already indented past an
                    avatar — about a third of the screen on a phone, for
                    correcting something that was typed as a paragraph.
                    Most messages here are several lines; an editor that
                    shows one of them is one you cannot read what you are
                    fixing in. Full width, a few lines tall, and the
                    buttons underneath where there is room for them.
                  */
                  <div className="mt-1">
                    <textarea
                      autoFocus
                      rows={3}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        // Ctrl+Enter saves, as it does in the writing box.
                        // Enter on its own is a new line: these are
                        // paragraphs, and losing a break to a stray
                        // keystroke is worse than one extra press.
                        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                          event.preventDefault()
                          void saveEdit()
                        }
                        if (event.key === 'Escape') setEditing(null)
                      }}
                      aria-label="Correct this message"
                      className="pad-serif min-h-[5rem] w-full resize-y rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-[15px] leading-relaxed outline-none focus:border-[var(--color-faint)]"
                    />
                    <div className="mt-1 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void saveEdit()}
                        className="rounded-full bg-[var(--color-accent)] px-3.5 py-1.5 text-[13px] font-medium text-white"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="rounded-full px-3 py-1.5 text-[13px] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <Said body={message.body} onOpen={() => setReading(message)} />
                )}

                {/*
                  Reply, correct, take down. Always there below `sm`: a
                  control that appears on hover does not exist on a phone,
                  which is a rule this app has paid for twice.
                */}
                {editing?.id !== message.id && (
                  <p className="mt-2 flex items-center gap-3 text-[12px] text-[var(--color-faint)] sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
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

      {reading && (
        <Sheet title={reading.authorName || 'Somebody'} onClose={() => setReading(null)}>
          <p className="mb-2 text-[12px] text-[var(--color-faint)]">
            {stamp(reading.createdAt)}
            {reading.editedAt ? ' · edited' : ''}
          </p>
          <p className="pad-serif text-[16px] leading-relaxed whitespace-pre-wrap">
            {reading.body}
          </p>
        </Sheet>
      )}

      {made && made.length > 0 && (
        <p className="mt-3 rounded-xl bg-[var(--color-accent-soft)] px-3 py-2 text-[13px] text-[var(--color-ink)]">
          {made.length === 1 ? 'One thing' : `${made.length} things`} added to Actions:{' '}
          {made.map((task) => task.text).join('; ')}
        </p>
      )}
      {problem && <p className="mt-2 text-[13px] text-[var(--color-danger)]">{problem}</p>}

      {/*
        The bar that opens the box.

        The same shape as "Write a note…" on the other side of the switch,
        and for the same reason: saying something to a team and jotting a
        note are the same act — a few lines, typed quickly, and then you
        are done. It was an inline box welded to the bottom of this screen,
        with its own idea of where the keyboard was and its own way of
        closing, and it was awkward in all the ways the note box had
        already stopped being.
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
        {/* Dark, like the bar that writes a note on the other side of the
            switch, and for the same reason: it is the one thing on this
            screen somebody came here to press. */}
        <button
          type="button"
          onClick={() => setWriting(true)}
          className="flex w-full items-center gap-2.5 rounded-full bg-[var(--color-ink)] px-4 py-3 text-left text-[15px] text-[var(--color-paper)] hover:opacity-90"
        >
          <MessageSquare size={16} />
          {text.trim()
            ? `Carry on: ${text.trim().slice(0, 40)}${text.trim().length > 40 ? '…' : ''}`
            : replying
              ? `Answer ${replying.authorName}…`
              : 'Start a chat…'}
        </button>
      </div>

      {/*
        And the box itself: the same pop-up as the one that makes a note,
        with the people in this team offered under the @ — see
        compose-sheet.tsx and mention-field.tsx.
      */}
      {writing && (
        <ComposeSheet
          title={replying ? `Answering ${replying.authorName}` : 'Say something'}
          value={text}
          onChange={setText}
          /* Closing keeps what was typed, in the bar, where it is plainly
             still there. Nothing is lost to a press that landed outside. */
          onClose={(kept) => {
            setText(kept)
            setWriting(false)
          }}
          onSave={() => void send()}
          saveLabel={busy ? 'Sending…' : 'Send'}
          busy={busy}
          label="Start a chat"
          /*
            No line of small print under the button.

            It said "anything you ask for here turns into work on the
            board", which is a screen explaining itself — and a notice
            like that goes in when the design cannot make the point on
            its own. This one can: the placeholder says what to type, and
            the answer arrives as the tasks themselves, listed under the
            message the moment they are made. Being shown is better than
            being told, and it is one less line above a phone keyboard.
          */
          placeholder="What needs doing? Use @ to give it to somebody."
        >
          {replying && (
            <p className="mb-1 flex items-center gap-1.5 text-[12px] text-[var(--color-faint)]">
              <CornerUpLeft size={12} />
              <span className="min-w-0 flex-1 truncate">
                {replying.authorName}: {replying.body}
              </span>
            </p>
          )}
          {/*
            The people, offered as soon as an @ is typed. It is the field
            component's list, hoisted above the box: the box is the
            pop-up's own textarea, and two textareas in one sheet is one of
            them being typed into by mistake.
          */}
          <Mentions text={text} members={members} onPick={setText} />
        </ComposeSheet>
      )}
    </div>
  )
}

/**
 * What somebody said, cut off if it is long.
 *
 * ## Why a chat truncates and a note does not
 *
 * Because a chat is a record you scroll through and a note is a thing you
 * sat down to read. One person pasting four hundred words into a team's
 * chat took the entire screen and pushed every other message out of it —
 * and nobody scrolls back up through somebody else's essay to find the
 * two-line answer underneath it. The card shows the top of it and says
 * there is more.
 *
 * ## Why the cut is a line count and not a character count
 *
 * `line-clamp` cuts where the text actually wraps, so a message of short
 * lines and a message of long ones both stop at the same height. Counting
 * characters gets that wrong in both directions and puts the ellipsis in
 * the middle of a word.
 *
 * ## Why the whole thing opens in a sheet
 *
 * It is the panel everything else in this app opens in: it scrolls, it
 * stops at the height of the window, it closes on a press outside, and it
 * locks the page behind it. An "expand in place" would push every message
 * below it down the screen, which is the thing being fixed.
 */
function Said({ body, onOpen }: { body: string; onOpen: () => void }) {
  /*
    Long enough to be worth cutting, measured the cheap way.

    Either more lines than the clamp will show, or more characters than
    that many lines can hold at this width. Neither is exact — the real
    answer is whether the painted element overflows — but a `ResizeObserver`
    per message in a list that repaints every ten seconds is a great deal
    of work to decide whether to draw four words. Erring towards offering
    the sheet costs a press that was not needed; erring the other way hides
    the end of a message.
  */
  const long = body.split('\n').length > CLAMP_LINES || body.length > CLAMP_CHARS

  if (!long) {
    return (
      <p className="pad-serif text-[15px] leading-relaxed whitespace-pre-wrap">{body}</p>
    )
  }

  /*
    The whole fold is one press, and it does not look like the row under it.

    "Read more" was a small accent line directly above Reply, Edit and
    Delete — four short links stacked two pixels apart, all of them
    pressable, and no way to tell at a glance which belonged to the
    message and which acted on it. It is part of the message now: the same
    text size as the words above it, weighted, with the whole block
    tappable, and the actions are pushed clear underneath.
  */
  return (
    <button type="button" onClick={onOpen} className="block w-full text-left">
      <span className="pad-serif line-clamp-3 block text-[15px] leading-relaxed whitespace-pre-wrap">
        {body}
      </span>
      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--color-paper)] px-2.5 py-1 text-[13px] font-medium text-[var(--color-accent)]">
        <ChevronDown size={13} />
        Read more
      </span>
    </button>
  )
}

/* ---------------------------------------------------------------- the board */

function Board({
  me,
  teamId,
  members,
  tasks,
  query,
  onChanged,
}: {
  me: { id: string; email: string; name: string }
  teamId: string
  members: Member[]
  tasks: TeamTask[]
  /** What is being looked for, or empty. Filtered here, on the device. */
  query: string
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  /** Which list is on. Side by side, because both are the same question. */
  const [showing, setShowing] = useState<'open' | 'done'>('open')
  /**
   * The task whose detail is open, if any.
   *
   * Held by the board rather than by the row so there is one of these on
   * screen at a time, and so it survives the list being re-read under it —
   * which it is, every ten seconds.
   */
  const [open, setOpen] = useState<string | null>(null)
  const opened = tasks.find((task) => task.id === open) ?? null

  /**
   * What was just ticked, and how long is left to say it was the wrong one.
   *
   * A tick takes a row off the list it was on, which on a phone is the
   * same disappearance a delete causes and happens about as often: small
   * boxes, a scrolling thumb, a shared board where the row somebody else
   * was looking at has now moved. Nothing is lost — it is under Done —
   * but "where did that go" is a question five seconds answers and a
   * search does not. Held here and never written anywhere, exactly as the
   * undo on your own Actions is.
   */
  const [undone, setUndone] = useState<{ id: string; text: string } | null>(null)
  const [left, setLeft] = useState(UNDO_SECONDS)

  useEffect(() => {
    if (!undone) return
    const beat = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000)
    const over = setTimeout(() => setUndone(null), UNDO_SECONDS * 1000)
    return () => {
      clearInterval(beat)
      clearTimeout(over)
    }
  }, [undone])

  const wanted = query.trim().toLowerCase()
  const matches = (task: TeamTask) =>
    !wanted ||
    `${task.text} ${task.assigneeName} ${task.due}`.toLowerCase().includes(wanted)

  const outstanding = tasks.filter((task) => !task.done && matches(task))
  const done = tasks.filter((task) => task.done && matches(task))
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
          {wanted
            ? 'Nothing here matches that.'
            : showing === 'open'
              ? 'Nothing outstanding. Say what needs doing in the chat and it turns up here.'
              : 'Nothing finished yet.'}
        </p>
      ) : (
        <ul className="mt-2 border-t border-[var(--color-line)]">
          {listed.map((task) => (
            <Row
              key={task.id}
              task={task}
              onChanged={onChanged}
              onOpen={() => setOpen(task.id)}
              onTicked={() => {
                setUndone({ id: task.id, text: task.text })
                setLeft(UNDO_SECONDS)
              }}
            />
          ))}
        </ul>
      )}

      {/*
        The undo, above the box that says something. The same bar, the
        same five seconds and the same countdown as the one on your own
        Actions, because it is the same mistake.
      */}
      {undone && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[4.75rem] z-30 px-4">
          <div className="pointer-events-auto mx-auto flex w-full max-w-5xl items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] py-2 pr-2 pl-4 shadow-lg">
            <p className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-muted)]">
              Ticked “{undone.text}”
            </p>
            <span aria-hidden className="shrink-0 text-[12px] text-[var(--color-faint)]">
              {left}
            </span>
            <button
              type="button"
              onClick={() => {
                const id = undone.id
                setUndone(null)
                void setTaskDone(id, false).then(onChanged)
              }}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-hover)]"
            >
              <Undo2 size={14} />
              Undo
            </button>
          </div>
        </div>
      )}

      {opened && (
        <Sheet title="This task" onClose={() => setOpen(null)}>
          <TaskDetail
            task={opened}
            members={members}
            onChanged={onChanged}
            onClose={() => setOpen(null)}
          />
        </Sheet>
      )}
    </div>
  )
}

/**
 * One task, opened.
 *
 * ## Why a task can be corrected at all, and by anybody in the team
 *
 * Because it was typed into a chat at speed, and half of them have a
 * wrong word, a missing name or a date somebody said out loud and nobody
 * wrote down. A job with your name on it that only the person who typed it
 * can fix is a job that stays wrong until they are free — so the policy in
 * 0007 lets any member change any task, which is the same permission that
 * already let anybody tick one.
 *
 * ## What it does not touch
 *
 * The message it came from. The chat is the record of what was actually
 * said and a task is a reading of it: correcting the reading must never
 * rewrite the sentence. Every task keeps the message it came out of for
 * exactly that reason — so there is always something to check it against.
 *
 * ## Why the date is still words
 *
 * "Friday" is not turned into a date here any more than it is anywhere
 * else in this app. Which Friday was meant is not something this knows,
 * and a wrong date on another person's task is worse than a vague one.
 */
function TaskDetail({
  task,
  members,
  onChanged,
  onClose,
}: {
  task: TeamTask
  members: Member[]
  onChanged: () => void
  onClose: () => void
}) {
  const [text, setText] = useState(task.text)
  const [due, setDue] = useState(task.due)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | undefined>()
  const [asking, setAsking] = useState(false)

  const changed = (text.trim() !== task.text && !!text.trim()) || due.trim() !== task.due

  const run = async (what: () => Promise<string | undefined>, close = false) => {
    if (busy) return
    setBusy(true)
    const why = await what()
    setBusy(false)
    if (why) {
      setProblem(why)
      return
    }
    onChanged()
    if (close) onClose()
  }

  const save = () =>
    void run(async () => {
      if (text.trim() !== task.text) {
        const why = await setTaskText(task.id, text)
        if (why) return why
      }
      if (due.trim() !== task.due) return setTaskDue(task.id, due)
      return undefined
    }, true)

  return (
    <div>
      {/* Room to write in. See the same field on the Me side: a box the
          height of the line it holds is one every correction scrolls in. */}
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        aria-label="What needs doing"
        className="pad-serif min-h-[6rem] w-full resize-y rounded-lg border border-[var(--color-line)] bg-[var(--color-hover)] px-3 py-2.5 text-[16px] leading-relaxed outline-none focus:border-[var(--color-faint)]"
      />

      <label className="mt-2 block">
        <span className="text-[12px] text-[var(--color-faint)]">
          When, in your own words — “Friday”, “end of the month”
        </span>
        <input
          value={due}
          onChange={(event) => setDue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && changed) save()
          }}
          aria-label="When it is for"
          className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-hover)] px-2.5 py-1.5 text-[14px] outline-none focus:border-[var(--color-faint)]"
        />
      </label>

      <div className="mt-3">
        <p className="text-[12px] text-[var(--color-faint)]">Whose it is</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {members.map((member) => {
            const mine = task.assigneeName === member.name
            return (
              <button
                key={member.email}
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    mine
                      ? setTaskAssignee(task.id, null, '')
                      : setTaskAssignee(task.id, member.userId, member.name),
                  )
                }
                className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] ${
                  mine
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] font-medium text-[var(--color-ink)]'
                    : 'border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-faint)]'
                }`}
              >
                {member.name}
                {mine && <Check size={12} />}
              </button>
            )
          })}
          {!task.assigneeName && (
            <span className="self-center text-[12px] text-[var(--color-faint)]">Nobody yet</span>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-[var(--color-line)] pt-3">
        <button
          type="button"
          onClick={() => void run(() => setTaskDone(task.id, !task.done))}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)] disabled:opacity-50"
        >
          {task.done ? <Circle size={15} /> : <CircleCheck size={15} />}
          {task.done ? 'Not done after all' : 'Done'}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy || !changed}
          className="ml-auto shrink-0 rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-[14px] font-medium text-white disabled:opacity-40"
        >
          Save
        </button>
      </div>

      {asking ? (
        <div className="mt-2 rounded-lg bg-[var(--color-hover)] p-2.5">
          <p className="text-[13px]">Delete this task? It comes off the board for everybody.</p>
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => deleteTask(task.id), true)}
              className="rounded-md bg-[var(--color-danger)] px-2.5 py-1.5 text-[13px] text-white disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setAsking(false)}
              className="rounded-md px-2.5 py-1.5 text-[13px] text-[var(--color-muted)]"
            >
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="mt-1 flex items-center gap-2 rounded-lg px-2 py-2 text-[14px] text-[var(--color-danger)] hover:bg-[var(--color-hover)]"
        >
          <Trash2 size={15} />
          Delete this task
        </button>
      )}

      {problem && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{problem}</p>}
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
function Row({
  task,
  onChanged,
  onOpen,
  onTicked,
}: {
  task: TeamTask
  onChanged: () => void
  /** Opens the detail. Changes nothing by itself. */
  onOpen: () => void
  /** Ticked, so the board can offer to put it back. */
  onTicked: () => void
}) {
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
        onClick={() => {
          if (!task.done) onTicked()
          void run(() => setTaskDone(task.id, !task.done))
        }}
        aria-label={task.done ? `Put “${task.text}” back` : `Tick “${task.text}”`}
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--color-faint)] hover:bg-[var(--color-hover)] hover:text-[var(--color-accent)]"
      >
        {task.done ? <CircleCheck size={16} /> : <Circle size={16} />}
      </button>
      {/*
        The words open it. A task typed into a chat at speed has a wrong
        one in it often enough that "tap it to fix it" is the first thing
        anybody tries, and until now nothing happened.
      */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open “${task.text}”`}
        className="min-w-0 flex-1 text-left"
      >
        <span className={`block text-[15px] leading-snug ${task.done ? 'text-[var(--color-faint)] line-through' : ''}`}>
          {task.text}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-[var(--color-muted)]">
          {task.assigneeName && <span>{task.assigneeName}</span>}
          {task.due && <span>{task.due}</span>}
          {/*
            When it turned up on the board.

            Not the same question as `due`, which is when it is *for* and
            is whatever words somebody wrote. This is a fact the database
            knows exactly, and on a shared board it is the one that says
            whether you are looking at this morning's list or last month's
            — "chase the agent" reads completely differently at two days
            old. Relative, because "three days ago" is the form that
            answers it without arithmetic.
          */}
          {task.createdAt > 0 && (
            <span className="text-[var(--color-faint)]">added {when(task.createdAt)}</span>
          )}
        </span>
      </button>
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

/**
 * The people to choose from, while an "@" is being typed in the pop-up.
 *
 * `mention-field.tsx` owns its own textarea, and the pop-up owns one too —
 * two in one sheet is one of them being typed into by mistake. So this is
 * the same rules with the field left out: it reads what is in the box,
 * offers whoever matches, and hands back the text with the name put in.
 *
 * The caret is not moved afterwards. In the pop-up the box is focused and
 * the name is inserted where the "@" was, which for the overwhelmingly
 * common case — typing "@" at the end of what you are writing — is exactly
 * where the caret already is.
 */
function Mentions({
  text,
  members,
  onPick,
}: {
  text: string
  members: Member[]
  onPick: (text: string) => void
}) {
  // The caret is not tracked here, so the "@" being typed is the last one:
  // true whenever somebody is in the middle of typing a name, which is the
  // only moment this is on screen.
  const picking = mentionAt(text, text.length)
  if (!picking) return null
  const offered = matchMembers(members, picking.query)
  if (!offered.length) return null

  return (
    <div className="mb-1 flex flex-wrap gap-1">
      {offered.map((member) => (
        <button
          key={member.email}
          type="button"
          // The keyboard stays up: every button steals the focus, and a
          // phone takes the keys down with it.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const handle = member.name.trim().split(/\s+/)[0]
            const before = text.slice(0, picking.at)
            const after = text.slice(picking.at + 1 + picking.query.length)
            onPick(`${before}@${handle} ${after.replace(/^\s+/, '')}`)
          }}
          className="flex items-center gap-1 rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[13px] hover:border-[var(--color-faint)]"
        >
          {member.name}
          {member.admin && <Star size={10} className="text-[var(--color-faint)]" />}
        </button>
      ))}
    </div>
  )
}
