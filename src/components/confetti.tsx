'use client'

import { useEffect, useRef } from 'react'

/**
 * Confetti, drawn on a canvas.
 *
 * On a canvas rather than as DOM nodes because two hundred absolutely
 * positioned divs falling at once will drop frames on the mid-range Android
 * phones most of this audience is holding — and a stuttering celebration reads
 * as a broken page, not a party.
 *
 * Respects prefers-reduced-motion by simply not running: somebody who has asked
 * their phone for less movement should not be handed a screen full of it.
 */
type Piece = {
  x: number
  y: number
  vx: number
  vy: number
  spin: number
  angle: number
  size: number
  colour: string
}

const COLOURS = ['#a855f7', '#22d3ee', '#a3e635', '#ffc94a', '#fb5c7d', '#ffffff']

export function Confetti({ pieces = 140 }: { pieces?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const context = canvas.getContext('2d')
    if (!context) return

    const scale = Math.min(window.devicePixelRatio || 1, 2)
    const width = canvas.offsetWidth
    const height = canvas.offsetHeight
    canvas.width = width * scale
    canvas.height = height * scale
    context.scale(scale, scale)

    const confetti: Piece[] = Array.from({ length: pieces }, () => ({
      x: Math.random() * width,
      // Start above the top edge so the first frame is not a solid band.
      y: -20 - Math.random() * height * 0.6,
      vx: (Math.random() - 0.5) * 2.2,
      vy: 2 + Math.random() * 3.4,
      spin: (Math.random() - 0.5) * 0.24,
      angle: Math.random() * Math.PI,
      size: 5 + Math.random() * 7,
      colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
    }))

    let frame = 0
    let running = true

    const draw = () => {
      if (!running) return
      context.clearRect(0, 0, width, height)
      frame += 1

      for (const piece of confetti) {
        piece.x += piece.vx
        piece.y += piece.vy
        piece.angle += piece.spin
        piece.vy += 0.02

        context.save()
        context.translate(piece.x, piece.y)
        context.rotate(piece.angle)
        context.fillStyle = piece.colour
        // Fade out over the last second rather than vanishing mid-air.
        context.globalAlpha = Math.max(0, Math.min(1, (420 - frame) / 60))
        context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2)
        context.restore()
      }

      if (frame < 420) requestAnimationFrame(draw)
    }

    requestAnimationFrame(draw)
    return () => {
      running = false
    }
  }, [pieces])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
    />
  )
}
