'use client'

import { useRef, useState } from 'react'
import { matchMembers, mentionAt, type Member } from '@/lib/team-chat'

/**
 * A field that knows what "@" means.
 *
 * ## Why it is one component and not two
 *
 * Because it was two, and one of them did not work: the chat box offered
 * the people in the team when you typed "@" and the box on the board did
 * not, so the same character meant something in one place and nothing a
 * tab away. A rule that holds in one field and not its neighbour is worse
 * than no rule.
 *
 * ## Where the list goes
 *
 * Above the field, always. Below is where the keyboard is on a phone, and
 * a list of names drawn underneath a box somebody is typing into is a list
 * nobody can see. The names keep the keyboard up when pressed — every
 * button steals the focus, and a phone takes the keys down with it.
 */
export default function MentionField({
  value,
  onChange,
  members,
  placeholder,
  label,
  multiline,
  onSubmit,
  className,
}: {
  value: string
  onChange: (value: string) => void
  members: Member[]
  placeholder: string
  label: string
  /** A chat message is several lines; a task is one. */
  multiline?: boolean
  /** Ctrl+Enter on the box, plain Enter on the line. */
  onSubmit?: () => void
  className?: string
}) {
  const [picking, setPicking] = useState<{ at: number; query: string } | null>(null)
  const box = useRef<HTMLTextAreaElement & HTMLInputElement>(null)

  const watch = (text: string, caret: number) => setPicking(mentionAt(text, caret))

  const choose = (member: Member) => {
    if (!picking) return
    const before = value.slice(0, picking.at)
    const after = value.slice(picking.at + 1 + picking.query.length)
    const handle = member.name.trim().split(/\s+/)[0]
    onChange(`${before}@${handle} ${after.replace(/^\s+/, '')}`)
    setPicking(null)
    // Back into the field, with the caret after the name rather than at the
    // end of whatever was already typed underneath it.
    requestAnimationFrame(() => {
      const el = box.current
      el?.focus()
      const at = before.length + handle.length + 2
      el?.setSelectionRange?.(at, at)
    })
  }

  const offered = picking ? matchMembers(members, picking.query) : []

  const shared = {
    ref: box,
    value,
    placeholder,
    'aria-label': label,
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      onChange(event.target.value)
      watch(event.target.value, event.target.selectionStart ?? 0)
    },
    onKeyUp: (event: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) =>
      watch(event.currentTarget.value, event.currentTarget.selectionStart ?? 0),
    onBlur: () => setPicking(null),
  }

  return (
    <div className="min-w-0 flex-1">
      {offered.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-1">
          {offered.map((member) => (
            <button
              key={member.email}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(member)}
              className="rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] px-2.5 py-1 text-[13px] hover:border-[var(--color-faint)]"
            >
              {member.name}
            </button>
          ))}
        </div>
      )}
      {multiline ? (
        <textarea
          {...shared}
          rows={1}
          onKeyDown={(event) => {
            // Ctrl+Enter sends, as it does in the note box. Enter is a new
            // line: a message about four jobs is four lines.
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              onSubmit?.()
            }
          }}
          className={className}
        />
      ) : (
        <input
          {...shared}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onSubmit?.()
            }
          }}
          className={className}
        />
      )}
    </div>
  )
}
