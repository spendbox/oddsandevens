'use client'

import { useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { Button } from './ui'

/**
 * Choosing a picture for a box.
 *
 * The file is shrunk in the browser before it is ever sent. A photo straight
 * off a phone is routinely 4-8MB, and uploading that over Nigerian mobile data
 * to decorate a box is a minute of waiting for something nobody asked to wait
 * for. Redrawn at 1200px on a canvas it lands at a couple of hundred kilobytes,
 * which is indistinguishable at the size it is displayed.
 *
 * If anything about that fails — an exotic format, a browser being difficult —
 * the original file is submitted untouched and the server's own size and type
 * checks decide. Shrinking is an optimisation, never the gate.
 */
const MAX_EDGE = 1200
const QUALITY = 0.82

export function ImagePicker({
  currentUrl,
  onPicked,
}: {
  currentUrl: string
  /** Told the local preview URL, so a live preview can show it before saving. */
  onPicked?: (url: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const choose = async (file: File) => {
    setBusy(true)
    const local = URL.createObjectURL(file)
    setPreview(local)
    onPicked?.(local)

    try {
      const shrunk = await shrink(file)
      if (shrunk && inputRef.current) {
        const bag = new DataTransfer()
        bag.items.add(shrunk)
        inputRef.current.files = bag.files
      }
    } catch {
      // Keep whatever the browser picked. The server checks it either way.
    }

    setBusy(false)
  }

  const shown = preview ?? (currentUrl || null)

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-mist">Picture (optional)</span>

      <input
        ref={inputRef}
        type="file"
        name="image"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void choose(file)
        }}
      />

      {shown ? (
        <div className="relative overflow-hidden rounded-2xl border border-white/12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shown} alt="Your box" className="h-44 w-full object-cover" />
          <button
            type="button"
            onClick={() => {
              setPreview(null)
              onPicked?.(currentUrl)
              if (inputRef.current) inputRef.current.value = ''
            }}
            aria-label="Choose a different picture"
            className="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-ink/80 text-chalk backdrop-blur"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-44 w-full flex-col items-center justify-center gap-2 rounded-2xl
                     border border-dashed border-white/15 text-mist transition
                     hover:border-violet/50 hover:text-chalk"
        >
          <ImagePlus size={26} />
          <span className="text-sm font-medium">Add a picture</span>
          <span className="text-xs text-dusk">JPEG, PNG or WebP</span>
        </button>
      )}

      {shown ? (
        <Button
          type="button"
          tone="ghost"
          size="sm"
          className="mt-3"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Preparing…' : 'Choose another'}
        </Button>
      ) : null}
    </div>
  )
}

/** Redraw an image at no more than MAX_EDGE on its longest side. */
async function shrink(file: File): Promise<File | null> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))

  // Already small enough. Re-encoding would only lose quality for nothing.
  if (scale === 1 && file.size < 900_000) return null

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)

  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  )
  if (!blob) return null

  return new File([blob], 'box.jpg', { type: 'image/jpeg' })
}
