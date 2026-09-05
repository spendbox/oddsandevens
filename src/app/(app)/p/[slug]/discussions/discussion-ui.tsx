'use client'

import Link from 'next/link'
import { useRef, useState, useTransition } from 'react'
import { Avatar } from '@/components/avatar'
import type { Profile, Stage } from '@/lib/types'
import { createPost, createReply, toggleUseful } from '../actions'

const KINDS = [
  { value: 'update', label: 'An update', hint: 'Where you have got to.' },
  { value: 'question', label: 'A question', hint: 'Something you are stuck on.' },
  { value: 'insight', label: 'What I learned', hint: 'Something that worked, and why.' },
  { value: 'win', label: 'A win', hint: 'Something worth marking.' },
]

/**
 * Posting asks what kind of thing this is before it asks for words. That single
 * choice is most of what separates a pursuit's discussion from a group chat:
 * it makes the board sortable, and it makes people write for the record.
 */
export function Composer({
  slug,
  pursuitId,
  stages,
  profile,
}: {
  slug: string
  pursuitId: string
  stages: Stage[]
  profile: Profile
}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState('update')
  const postForm = useRef<HTMLFormElement>(null)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card card-hover flex w-full items-center gap-3 p-4 text-left"
      >
        <Avatar profile={profile} size="sm" />
        <span className="text-sm text-ink-faint">Share an update, a question, or what you learned…</span>
      </button>
    )
  }

  return (
    <form
      ref={postForm}
      action={async (formData) => {
        await createPost(formData)
        postForm.current?.reset()
        setOpen(false)
      }}
      className="card p-4"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="pursuit_id" value={pursuitId} />
      <input type="hidden" name="kind" value={kind} />

      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setKind(option.value)}
            className={`chip transition-colors ${
              kind === option.value
                ? 'bg-accent text-white'
                : 'bg-mist text-ink-muted hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className="mt-2 text-[11px] text-ink-faint">
        {KINDS.find((option) => option.value === kind)?.hint}
      </p>

      <input
        name="title"
        placeholder="A one-line summary (optional)"
        className="field mt-3"
      />

      <textarea
        name="body"
        rows={5}
        required
        placeholder="Write it the way you would explain it to someone one step behind you."
        className="field mt-2.5 resize-none"
      />

      {stages.length > 0 ? (
        <select name="stage_id" className="field mt-2.5" defaultValue="">
          <option value="">Not tied to a stage</option>
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              Relevant at: {stage.name}
            </option>
          ))}
        </select>
      ) : null}

      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn btn-quiet">
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Post
        </button>
      </div>
    </form>
  )
}

export function KindFilter({ slug, selected }: { slug: string; selected: string }) {
  const options = [
    { value: 'all', label: 'Everything' },
    { value: 'question', label: 'Questions' },
    { value: 'insight', label: 'What people learned' },
    { value: 'win', label: 'Wins' },
    { value: 'update', label: 'Updates' },
  ]

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1.5">
        {options.map((option) => (
          <Link
            key={option.value}
            href={option.value === 'all' ? `/p/${slug}/discussions` : `/p/${slug}/discussions?kind=${option.value}`}
            className={`chip transition-colors ${
              selected === option.value
                ? 'bg-accent text-white'
                : 'bg-mist text-ink-muted hover:text-ink'
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>
    </div>
  )
}

export function PostActions({
  slug,
  postId,
  usefulCount,
  marked,
  replyCount,
}: {
  slug: string
  postId: string
  usefulCount: number
  marked: boolean
  replyCount: number
}) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="mt-3 flex items-center gap-4">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(() => {
            void toggleUseful(slug, postId)
          })
        }
        className={`flex items-center gap-1.5 text-[12px] font-medium transition-colors ${
          marked ? 'text-accent' : 'text-ink-muted hover:text-ink'
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1zm0 0 4.5-7.5a2 2 0 0 1 3.6 1.5L14 9h5a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17.6 20H7"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
        {marked ? 'Useful' : 'Mark useful'}
        {usefulCount > 0 ? <span className="tabular-nums">· {usefulCount}</span> : null}
      </button>

      <span className="text-[12px] text-ink-muted">
        {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
      </span>
    </div>
  )
}

export function ReplyForm({ slug, postId }: { slug: string; postId: string }) {
  const [open, setOpen] = useState(false)
  const replyForm = useRef<HTMLFormElement>(null)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-[12px] font-medium text-accent hover:text-accent-hover"
      >
        Reply
      </button>
    )
  }

  return (
    <form
      ref={replyForm}
      action={async (formData) => {
        await createReply(formData)
        replyForm.current?.reset()
        setOpen(false)
      }}
      className="mt-3"
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="post_id" value={postId} />
      <textarea
        name="body"
        rows={3}
        required
        autoFocus
        placeholder="Answer from your own experience, not in general."
        className="field resize-none text-[13px]"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn btn-quiet">
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Reply
        </button>
      </div>
    </form>
  )
}
