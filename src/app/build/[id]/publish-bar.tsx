'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { Tool } from '@/lib/types'
import { deleteTool, setStatus } from './actions'

/** Publishing, and the link that comes with it. The link is the product. */
export function PublishBar({ tool, runnable }: { tool: Tool; runnable: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const published = tool.status === 'published'
  const link = typeof window === 'undefined' ? `/t/${tool.slug}` : `${window.location.origin}/t/${tool.slug}`

  return (
    <div className="border-b border-line bg-mist/60">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        {published ? (
          <>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(link)
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              className="min-w-0 flex-1 truncate rounded-[10px] border border-line-strong bg-white px-3 py-2 text-left font-mono text-[12px] text-ink-soft transition-colors hover:border-accent"
              title="Copy this link"
            >
              {link.replace(/^https?:\/\//, '')}
            </button>
            <span className="text-[12px] text-lift">{copied ? 'Copied' : ''}</span>
          </>
        ) : (
          <p className="min-w-0 flex-1 text-[13px] text-ink-muted">
            {runnable
              ? 'Not published yet. Publishing gives you a link you can share with anyone.'
              : 'This tool cannot be published until it runs.'}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending || (!published && !runnable)}
            onClick={() =>
              startTransition(async () => {
                setError(null)
                const result = await setStatus(tool.id, published ? 'draft' : 'published')
                if (result?.error) setError(result.error)
                else router.refresh()
              })
            }
            className={published ? 'btn btn-quiet' : 'btn btn-primary'}
          >
            {pending ? '…' : published ? 'Unpublish' : 'Publish'}
          </button>

          <button
            type="button"
            onClick={() => {
              if (!confirm(`Delete "${tool.title}"? This cannot be undone.`)) return
              startTransition(async () => {
                await deleteTool(tool.id)
              })
            }}
            className="btn btn-ghost"
          >
            Delete
          </button>
        </div>
      </div>

      {error ? (
        <div className="mx-auto max-w-6xl px-4 pb-3 sm:px-6">
          <p role="alert" className="text-[12px] text-rose">
            {error}
          </p>
        </div>
      ) : null}
    </div>
  )
}
