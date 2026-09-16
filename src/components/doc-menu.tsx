'use client'

import {
  Check,
  Copy,
  Download,
  FileDown,
  FileText,
  FileType,
  FileUp,
  Link2,
  Link2Off,
  LoaderCircle,
  MoreHorizontal,
  Printer,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { docToMarkdown, docToText, safeFilename } from '@/lib/export'
import { existingShare, publishDoc, unpublishDoc } from '@/lib/share'
import { isSyncConfigured } from '@/lib/supabase'
import type { Doc } from '@/lib/types'

/**
 * What you can do with the whole document: get it out, or bring something in.
 *
 * "Save as PDF" goes through the browser's own print pipeline rather than a
 * PDF writer. jsPDF and pdf-lib are 200-400KB to do worse: the browser already
 * has a typesetter that handles page breaks, fonts, ligatures and right-to-left
 * text correctly, and on every platform "Print" offers "Save as PDF" as a
 * destination. The whole feature costs a print stylesheet and no JavaScript at
 * all, which is the only way it fits the weight budget.
 */
export default function DocMenu({
  doc,
  onImportPdf,
  onImportWord,
  importing,
  accountId,
}: {
  doc: Doc
  onImportPdf: (file: File) => void
  onImportWord: (file: File) => void
  importing: boolean
  /** Null when nobody is signed in, which is what sharing requires. */
  accountId: string | null
}) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [share, setShare] = useState<{ url: string | null; busy: boolean; problem?: string }>({
    url: null,
    busy: false,
  })
  const [copied, setCopied] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const wordPicker = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState<string | null>(null)

  // Look up an existing link when the menu is opened, not on every render, so
  // a document that was shared once still shows its link after a reload.
  useEffect(() => {
    if (!open || !accountId) return
    let cancelled = false
    void existingShare(doc.id, accountId).then((url) => {
      if (!cancelled) setShare((s) => (s.busy ? s : { url, busy: false }))
    })
    return () => {
      cancelled = true
    }
  }, [open, accountId, doc.id])

  // A different document has a different link. Adjusted during render rather
  // than in an effect, so the menu never paints the previous document's link
  // for a frame — which someone could copy.
  const [lastDocId, setLastDocId] = useState(doc.id)
  if (doc.id !== lastDocId) {
    setLastDocId(doc.id)
    setShare({ url: null, busy: false })
    setCopied(false)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

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
    setOpen(false)
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Document actions"
        className="rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
      >
        {importing ? (
          <LoaderCircle size={17} className="animate-spin" />
        ) : saved ? (
          <Check size={17} className="text-[var(--color-good)]" />
        ) : (
          <MoreHorizontal size={17} />
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-60 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] p-1 shadow-lg">
          <Item
            icon={<Printer size={14} />}
            label="Save as PDF"
            hint="Opens Print — choose Save as PDF"
            onClick={() => {
              setOpen(false)
              // A tick, so the menu is gone before the print snapshot is taken.
              setTimeout(() => window.print(), 80)
            }}
          />
          <Item
            icon={<FileDown size={14} />}
            label="Download Markdown"
            hint="Opens in any editor, keeps structure"
            onClick={() => download(docToMarkdown(doc), 'md', 'text/markdown')}
          />
          <Item
            icon={<FileText size={14} />}
            label="Download plain text"
            onClick={() => download(docToText(doc), 'txt', 'text/plain')}
          />
          <Item
            icon={<FileType size={14} />}
            label="Download as Word"
            hint="Opens in Word, Pages or Google Docs"
            onClick={async () => {
              setOpen(false)
              setProblem(null)
              try {
                // Loaded here rather than with the page: nobody downloads a
                // Word writer to jot down a shopping list.
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

          <div className="my-1 h-px bg-[var(--color-line)]" />

          {share.url ? (
            <div className="px-2.5 py-1.5">
              <p className="mb-1 text-[10px] text-[var(--color-faint)]">
                Anyone with this link can read it
              </p>
              <div className="flex items-center gap-1">
                <input
                  readOnly
                  value={share.url}
                  aria-label="Share link"
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded border border-[var(--color-line)] bg-[var(--color-hover)] px-1.5 py-1 text-[10px] outline-none"
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
                        // Clipboard access can be refused. The link is on
                        // screen and selectable, so this is not a dead end.
                      },
                    )
                  }}
                  className="rounded p-1 text-[var(--color-muted)] hover:bg-[var(--color-hover)]"
                >
                  {copied ? <Check size={13} className="text-[var(--color-good)]" /> : <Copy size={13} />}
                </button>
              </div>
              <Item
                icon={<Link2Off size={14} />}
                label={share.busy ? 'Working…' : 'Stop sharing'}
                onClick={async () => {
                  if (!accountId) return
                  setShare((s) => ({ ...s, busy: true }))
                  const done = await unpublishDoc(doc.id, accountId)
                  setShare({
                    url: done ? null : share.url,
                    busy: false,
                    problem: done ? undefined : 'Could not stop sharing.',
                  })
                }}
              />
              <Item
                icon={<Link2 size={14} />}
                label="Update the shared copy"
                hint="The link shows a snapshot, not live edits"
                onClick={async () => {
                  if (!accountId) return
                  setShare((s) => ({ ...s, busy: true }))
                  const result = await publishDoc(doc, accountId)
                  setShare({ url: result.url ?? share.url, busy: false, problem: result.problem })
                }}
              />
            </div>
          ) : (
            <Item
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
            <p className="px-2.5 pb-1 text-[10px] leading-snug text-[var(--color-danger)]">
              {share.problem}
            </p>
          )}

          <div className="my-1 h-px bg-[var(--color-line)]" />

          <Item
            icon={<FileUp size={14} />}
            label="Import a Word document"
            hint="Opens a .docx so you can edit it"
            onClick={() => wordPicker.current?.click()}
          />
          <Item
            icon={<FileUp size={14} />}
            label="Import a PDF as text"
            hint="Pulls the words out so you can edit them"
            onClick={() => picker.current?.click()}
          />
          <p className="px-2.5 pt-1 pb-1 text-[10px] leading-snug text-[var(--color-faint)]">
            A scanned PDF has no text to pull out — only one made from a
            document does.
          </p>
        </div>
      )}

      {problem && (
        <p className="absolute right-0 z-50 mt-1 w-60 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] p-2 text-[10px] leading-snug text-[var(--color-danger)] shadow-lg">
          {problem}
        </p>
      )}

      <input
        ref={wordPicker}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="sr-only"
        aria-label="Choose a Word document"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onImportWord(file)
          e.target.value = ''
          setOpen(false)
        }}
      />

      <input
        ref={picker}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        aria-label="Choose a PDF"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onImportPdf(file)
          e.target.value = ''
          setOpen(false)
        }}
      />
    </div>
  )
}

function Item({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-[var(--color-hover)]"
    >
      <span className="mt-0.5 text-[var(--color-muted)]">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs">{label}</span>
        {hint && <span className="block text-[10px] text-[var(--color-faint)]">{hint}</span>}
      </span>
    </button>
  )
}

/** Exported so the download action can be reused elsewhere. */
export { Download }
