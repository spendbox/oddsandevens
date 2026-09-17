'use client'

import {
  Check,
  ChevronDown,
  Copy,
  FileDown,
  FileText,
  FileType,
  FileUp,
  FolderInput,
  FolderOpen,
  Link2,
  Link2Off,
  ListChecks,
  LoaderCircle,
  Printer,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { docToMarkdown, docToText, safeFilename } from '@/lib/export'
import { useFolds } from '@/lib/folds'
import { existingShare, publishDoc, unpublishDoc } from '@/lib/share'
import { isSyncConfigured } from '@/lib/supabase'
import type { Doc, Project } from '@/lib/types'
import FolderPicker from './folder-picker'

/**
 * Everything about the open document, in the side menu.
 *
 * ## Why it is not a ⋯ menu in the header any more
 *
 * Because it had grown into one. A menu is the right shape for four things
 * somebody does occasionally; it is the wrong shape for "which folder is this
 * in", "how does typing behave here", "what is this document for" and "get me
 * a PDF" — questions about the document that deserve to be readable at a
 * glance rather than found by opening something. The side menu is already the
 * place the document's context lives, so its settings live there too, in one
 * order, from where it is filed through to what can be brought into it.
 *
 * ## Why the sections fold
 *
 * Because most days none of this is wanted, and a column of twelve rows down
 * the side of a page somebody opened to write on is furniture. Folded, it is
 * three headings; open, it is everything. The state is remembered per device —
 * see lib/folds.ts — for the same reason the theme is.
 *
 * ## What is deliberately still not here
 *
 * Nothing that edits the text. The assistant is reached from here, and it
 * still shows its work and applies nothing on its own.
 */
export interface DocSettingsProps {
  doc: Doc
  /** Every folder, so this document can be moved into one. */
  projects: Project[]
  /** The folder it is in now, or null when it is loose. */
  project: Project | null
  onMove: (projectId: string | null) => void
  onNewFolder: () => void
  onDelete: () => void
  onImportPdf: (file: File) => void
  onImportWord: (file: File) => void
  importing: boolean
  /** Null when nobody is signed in, which is what sharing requires. */
  accountId: string | null
  /** Reads the document back and shows what to do next. */
  onPlan: () => void
}

export default function DocSettings({
  doc,
  projects,
  project,
  onMove,
  onNewFolder,
  onDelete,
  onImportPdf,
  onImportWord,
  importing,
  accountId,
  onPlan,
}: DocSettingsProps) {
  const [moving, setMoving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [share, setShare] = useState<{ url: string | null; busy: boolean; problem?: string }>({
    url: null,
    busy: false,
  })
  const [copied, setCopied] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const wordPicker = useRef<HTMLInputElement>(null)
  const { folded, toggle } = useFolds()

  /*
    A different document has a different link, and has not been asked about
    deleting. Adjusted during render rather than in an effect, so this never
    paints the previous document's share link for a frame — which somebody
    could copy.
  */
  const [lastId, setLastId] = useState(doc.id)
  if (doc.id !== lastId) {
    setLastId(doc.id)
    setShare({ url: null, busy: false })
    setCopied(false)
    setConfirming(false)
    setProblem(null)
  }

  // Looked up once per document rather than on every render, so a document
  // shared earlier still shows its link after a reload.
  useEffect(() => {
    if (!accountId) return
    let cancelled = false
    void existingShare(doc.id, accountId).then((url) => {
      if (!cancelled) setShare((current) => (current.busy ? current : { url, busy: false }))
    })
    return () => {
      cancelled = true
    }
  }, [accountId, doc.id])

  const download = (contents: string, extension: string, type: string) => {
    const blob = new Blob([contents], { type })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = safeFilename(doc.title, extension)
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setSaved(extension)
    setTimeout(() => setSaved(null), 1600)
  }

  return (
    <div className="px-2">
      {/*
        Where it is filed, first and always visible.

        A document with no folder says so rather than showing nothing: an
        absent row reads as "there is no such thing as a folder here", and a
        loose document is exactly the one somebody wants to put somewhere.
      */}
      <button
        type="button"
        aria-label="Move this document to a folder"
        onClick={() => setMoving(true)}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] hover:bg-[var(--color-hover)] ${
          project ? 'text-[var(--color-muted)]' : 'text-[var(--color-accent)]'
        }`}
      >
        {project ? (
          <FolderOpen size={14} className="shrink-0" />
        ) : (
          <FolderInput size={14} className="shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">
          {project ? project.name || 'Untitled folder' : 'Not in a folder'}
        </span>
        <span className="shrink-0 text-[12px] text-[var(--color-faint)]">
          {project ? 'Move' : 'File it'}
        </span>
      </button>

      {/*
        The one action in here, and the only thing in this app that reads the
        document back. It is a button rather than something that watches what
        is typed: a plan that appears while somebody is still writing is an
        interruption, and one that appears without being asked for is a bill.
      */}
      <button
        type="button"
        onClick={onPlan}
        className="mt-1 flex w-full items-center gap-2 rounded-lg bg-[var(--color-accent-soft)] px-2.5 py-2.5 text-left text-[var(--color-accent)] hover:opacity-85"
      >
        <ListChecks size={16} className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium">What to do next</span>
          <span className="block text-[12px] opacity-80">
            Reads these notes and lists the actions
          </span>
        </span>
      </button>

      <Section id="doc-file" label="This file" folded={folded('doc-file')} onToggle={toggle}>
        {share.url ? (
          <div className="px-1 py-1">
            <p className="mb-1 text-[12px] text-[var(--color-faint)]">
              Anyone with this link can read it
            </p>
            <div className="flex items-center gap-1">
              <input
                readOnly
                value={share.url}
                aria-label="Share link"
                onFocus={(event) => event.currentTarget.select()}
                className="min-w-0 flex-1 rounded border border-[var(--color-line)] bg-[var(--color-hover)] px-1.5 py-1 text-[12px] outline-none"
              />
              <button
                type="button"
                aria-label="Copy link"
                onClick={() => {
                  navigator.clipboard?.writeText(share.url ?? '').then(
                    () => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    },
                    () => {
                      // Clipboard access can be refused. The link is on screen
                      // and selectable, so this is not a dead end.
                    },
                  )
                }}
                className="shrink-0 rounded p-1 text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
              >
                {copied ? <Check size={13} className="text-[var(--color-good)]" /> : <Copy size={13} />}
              </button>
            </div>
            <Row
              icon={<Link2 size={14} />}
              label="Update the shared copy"
              hint="The link shows a snapshot, not live edits"
              onClick={async () => {
                if (!accountId) return
                setShare((current) => ({ ...current, busy: true }))
                const result = await publishDoc(doc, accountId)
                setShare({ url: result.url ?? share.url, busy: false, problem: result.problem })
              }}
            />
            <Row
              icon={<Link2Off size={14} />}
              label={share.busy ? 'Working…' : 'Stop sharing'}
              onClick={async () => {
                if (!accountId) return
                setShare((current) => ({ ...current, busy: true }))
                const done = await unpublishDoc(doc.id, accountId)
                setShare({
                  url: done ? null : share.url,
                  busy: false,
                  problem: done ? undefined : 'Could not stop sharing.',
                })
              }}
            />
          </div>
        ) : (
          <Row
            icon={share.busy ? <LoaderCircle size={14} className="animate-spin" /> : <Link2 size={14} />}
            label="Share a link"
            hint={
              !isSyncConfigured()
                ? 'Needs an account, which is not set up here'
                : !accountId
                  ? 'Sign in first, top right'
                  : 'Anyone with the link can read it'
            }
            onClick={async () => {
              if (!accountId) {
                setShare({
                  url: null,
                  busy: false,
                  problem: isSyncConfigured()
                    ? 'Sign in first — the button is in the top right.'
                    : 'Sharing publishes a copy to a server, so it needs an account. This copy of Pad has none set up. You can still download the document or save it as a PDF.',
                })
                return
              }
              setShare({ url: null, busy: true })
              const result = await publishDoc(doc, accountId)
              setShare({ url: result.url ?? null, busy: false, problem: result.problem })
            }}
          />
        )}

        {share.problem && (
          <p className="px-2 pb-1 text-[12px] leading-snug text-[var(--color-danger)]">
            {share.problem}
          </p>
        )}

        <Row
          icon={<Printer size={14} />}
          label="Save as PDF"
          hint="Opens Print — choose Save as PDF"
          // A tick, so the drawer is gone before the print snapshot is taken.
          onClick={() => setTimeout(() => window.print(), 80)}
        />
        <Row
          icon={saved === 'md' ? <Check size={14} className="text-[var(--color-good)]" /> : <FileDown size={14} />}
          label="Download Markdown"
          onClick={() => download(docToMarkdown(doc), 'md', 'text/markdown')}
        />
        <Row
          icon={saved === 'txt' ? <Check size={14} className="text-[var(--color-good)]" /> : <FileText size={14} />}
          label="Download plain text"
          onClick={() => download(docToText(doc), 'txt', 'text/plain')}
        />
        <Row
          icon={saved === 'docx' ? <Check size={14} className="text-[var(--color-good)]" /> : <FileType size={14} />}
          label="Download as Word"
          onClick={async () => {
            setProblem(null)
            try {
              // Loaded here rather than with the page: nobody downloads a Word
              // writer to jot down a shopping list.
              const { docToDocx } = await import('@/lib/docx')
              const blob = await docToDocx(doc)
              const url = URL.createObjectURL(blob)
              const link = document.createElement('a')
              link.href = url
              link.download = safeFilename(doc.title, 'docx')
              link.click()
              setTimeout(() => URL.revokeObjectURL(url), 1000)
              setSaved('docx')
              setTimeout(() => setSaved(null), 1600)
            } catch (error) {
              setProblem(
                error instanceof Error ? error.message : 'Could not build the Word document.',
              )
            }
          }}
        />

        <Row
          icon={importing ? <LoaderCircle size={14} className="animate-spin" /> : <FileUp size={14} />}
          label="Import a Word document"
          hint="Adds a .docx to the end of this one"
          onClick={() => wordPicker.current?.click()}
        />
        <Row
          icon={importing ? <LoaderCircle size={14} className="animate-spin" /> : <FileUp size={14} />}
          label="Import a PDF as text"
          hint="A scanned PDF has no text to pull out"
          onClick={() => picker.current?.click()}
        />

        {problem && (
          <p className="px-2 py-1 text-[12px] leading-snug text-[var(--color-danger)]">{problem}</p>
        )}

        {confirming ? (
          <div className="px-2 py-2">
            <p className="mb-1.5 text-[13px] leading-snug text-[var(--color-danger)]">
              Move “{doc.title.trim() || 'Untitled'}” to the trash?
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setConfirming(false)
                  onDelete()
                }}
                className="rounded-md bg-[var(--color-danger)] px-2.5 py-1.5 text-[13px] font-medium text-white"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md px-2.5 py-1.5 text-[13px] text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
              >
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <Row
            icon={<Trash2 size={14} />}
            label="Delete this document"
            hint="Recoverable from the trash for 7 days"
            danger
            onClick={() => setConfirming(true)}
          />
        )}
      </Section>

      <FolderPicker
        open={moving}
        onClose={() => setMoving(false)}
        projects={projects}
        currentId={doc.projectId}
        onMove={onMove}
        onNewFolder={onNewFolder}
      />

      <input
        ref={wordPicker}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="sr-only"
        aria-label="Choose a Word document"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onImportWord(file)
          event.target.value = ''
        }}
      />
      <input
        ref={picker}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        aria-label="Choose a PDF"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onImportPdf(file)
          event.target.value = ''
        }}
      />
    </div>
  )
}

/** One folding group of the document's settings. */
function Section({
  id,
  label,
  folded,
  onToggle,
  children,
}: {
  id: string
  label: string
  folded: boolean
  onToggle: (id: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="mt-1">
      <button
        type="button"
        aria-expanded={!folded}
        onClick={() => onToggle(id)}
        className="flex w-full items-center gap-1 rounded-md px-1.5 py-1.5 text-left hover:bg-[var(--color-hover)]"
      >
        <ChevronDown
          size={13}
          className={`shrink-0 text-[var(--color-faint)] transition-transform ${
            folded ? '-rotate-90' : ''
          }`}
        />
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold tracking-wide text-[var(--color-faint)] uppercase">
          {label}
        </span>
      </button>
      {!folded && children}
    </div>
  )
}

function Row({
  icon,
  label,
  hint,
  danger,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // 44px of height where a hint makes one, because half the presses here
      // are a thumb on a phone where this panel is the whole screen.
      className={`flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-[var(--color-hover)] ${
        danger ? 'text-[var(--color-danger)]' : ''
      }`}
    >
      <span className={`mt-0.5 shrink-0 ${danger ? '' : 'text-[var(--color-muted)]'}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-[13px]">{label}</span>
        {hint && (
          <span className="block text-[12px] leading-snug text-[var(--color-faint)]">{hint}</span>
        )}
      </span>
    </button>
  )
}
