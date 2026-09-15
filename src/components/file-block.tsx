'use client'

import { Download, FileText, Paperclip, Trash2, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { newId } from '@/lib/id'
import { deleteFile, loadFile, saveFile } from '@/lib/store'
import type { FileBlock as FileBlockData } from '@/lib/types'

/**
 * An attached file.
 *
 * The bytes live in IndexedDB under the block's `ref`, never on the block
 * itself — see the note on FileBlock. Everything here runs on the device: no
 * upload endpoint, no bucket, no waiting. Attaching a file to a document is as
 * immediate as typing into it, which is the same promise the rest of the app
 * makes.
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Past this, a file is refused with an explanation rather than silently
 * failing. Browsers give an origin a storage budget, not unlimited space, and
 * a video dropped into a note can exhaust it and take the documents with it.
 */
const MAX_BYTES = 25 * 1024 * 1024

export default function FileBlock({
  block,
  onChange,
  onRemove,
  onExtractPdf,
}: {
  block: FileBlockData
  onChange: (next: FileBlockData) => void
  /** Removes the block itself, for when no file is ever chosen. */
  onRemove: () => void
  /** Offered for PDFs: pull the text out into editable blocks. */
  onExtractPdf?: (file: Blob, name: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  // An object URL is a live handle into memory, not a string. Left unrevoked,
  // every image ever opened stays resident for the life of the tab.
  useEffect(() => {
    if (!block.ref || !block.mime.startsWith('image/')) return
    let url: string | null = null
    let cancelled = false
    void loadFile(block.ref).then((blob) => {
      if (!blob || cancelled) return
      url = URL.createObjectURL(blob)
      setPreview(url)
    })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [block.ref, block.mime])

  const accept = async (file: File) => {
    setProblem(null)
    if (file.size > MAX_BYTES) {
      setProblem(`That file is ${formatSize(file.size)}. The limit is ${formatSize(MAX_BYTES)}.`)
      return
    }
    setBusy(true)
    const ref = newId()
    const stored = await saveFile(ref, file)
    setBusy(false)
    if (!stored) {
      setProblem('Could not save the file. This browser may be out of storage space.')
      return
    }
    // Replace rather than orphan: swapping the file on an existing block would
    // otherwise leave the old bytes in IndexedDB with nothing pointing at them.
    if (block.ref) void deleteFile(block.ref)
    onChange({ ...block, name: file.name, mime: file.type, size: file.size, ref })
  }

  const download = async () => {
    const blob = await loadFile(block.ref)
    if (!blob) {
      setProblem('Those bytes are not on this device. Attachments do not sync yet.')
      return
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = block.name || 'file'
    link.click()
    // Revoking immediately can cancel the download in some browsers; a tick
    // later the navigation has already started.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const isPdf = block.mime === 'application/pdf' || block.name.toLowerCase().endsWith('.pdf')

  if (!block.ref) {
    return (
      <div className="group/drop relative my-2 print:hidden">
        {/*
          Changing your mind has to be possible. Inserting the block and then
          deciding against a file used to leave a drop zone with no way to get
          rid of it short of deleting the line from the keyboard.
        */}
        <button
          type="button"
          aria-label="Remove this file block"
          title="Remove this file block"
          onClick={onRemove}
          className="absolute top-1 right-1 z-10 rounded p-1 text-[var(--color-faint)] opacity-60 transition-opacity hover:bg-[var(--color-hover)] hover:text-[var(--color-danger)] focus:opacity-100 sm:opacity-0 sm:group-hover/drop:opacity-100"
        >
          <X size={13} />
        </button>
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files[0]
            if (file) void accept(file)
          }}
          className={`flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-xs transition-colors ${
            dragOver
              ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
              : 'border-[var(--color-line)] text-[var(--color-muted)] hover:bg-[var(--color-hover)]'
          }`}
        >
          <Upload size={15} />
          {busy ? 'Saving…' : 'Choose a file, or drop one here'}
        </button>
        {problem && <p className="mt-1 text-[11px] text-[var(--color-danger)]">{problem}</p>}
        <input
          ref={input}
          type="file"
          className="sr-only"
          aria-label="Choose a file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void accept(file)
            // Reset, or choosing the same file twice in a row fires nothing.
            e.target.value = ''
          }}
        />
      </div>
    )
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-[var(--color-line)]">
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt={block.name}
          className="max-h-96 w-full bg-[var(--color-hover)] object-contain"
        />
      )}
      <div className="flex items-center gap-2 px-3 py-2">
        <Paperclip size={14} className="shrink-0 text-[var(--color-faint)]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{block.name}</span>
          <span className="block text-[11px] text-[var(--color-faint)]">
            {formatSize(block.size)} · on this device
          </span>
        </span>
        {isPdf && onExtractPdf && (
          <Action
            label="Text"
            title="Pull the text out of this PDF into editable blocks"
            icon={<FileText size={13} />}
            onClick={async () => {
              const blob = await loadFile(block.ref)
              if (blob) onExtractPdf(blob, block.name)
              else setProblem('Those bytes are not on this device.')
            }}
          />
        )}
        <Action label="Save" icon={<Download size={13} />} onClick={download} />
        <Action
          label="Remove"
          icon={<Trash2 size={13} />}
          danger
          onClick={() => {
            void deleteFile(block.ref)
            onChange({ ...block, name: '', mime: '', size: 0, ref: '' })
          }}
        />
      </div>
      {problem && <p className="px-3 pb-2 text-[11px] text-[var(--color-danger)]">{problem}</p>}
    </div>
  )
}

function Action({
  label,
  icon,
  onClick,
  danger,
  title,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  danger?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      aria-label={label}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] hover:bg-[var(--color-hover)] print:hidden ${
        danger ? 'text-[var(--color-faint)] hover:text-[var(--color-danger)]' : 'text-[var(--color-muted)]'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
