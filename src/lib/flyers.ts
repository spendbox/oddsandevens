/**
 * The promotional flyers, drawn on a canvas.
 *
 * Three designs, generated in the browser from whatever the box says right
 * now. That is the whole reason they are drawn rather than stored: a creator
 * who renames their box does not have to remember to regenerate anything, and
 * there are no stale PNGs sitting in a bucket advertising an old name.
 *
 * Square, 1080x1080, because that is what every place these get posted wants —
 * WhatsApp status, an Instagram post, an X image.
 *
 * ── How the layout works, and why it is not a list of coordinates ──────────
 *
 * Everything sits inside a margin and is placed by a cursor that moves down the
 * page. Every block asks for the space it needs and the cursor advances by that
 * plus a gap from a small scale. Nothing is positioned against the bottom of
 * the canvas except the footer, which is measured from it.
 *
 * This is the second attempt. The first used fixed y positions per element,
 * looked correct for a one-line title, and ran the caption straight through the
 * grid the moment a title wrapped to two. Fixed coordinates cannot survive
 * text somebody else types.
 */

export type FlyerStyle = 'bold' | 'grid' | 'ticket'

export type FlyerData = {
  code: string
  title: string
  description: string
  prize: string
  creator: string
  url: string
}

const SIZE = 1080

/** The page margin. Everything lives inside this. */
const MARGIN = 96

/** The vertical rhythm. Gaps come from here, never from a guessed number. */
const GAP = { tight: 18, normal: 40, loose: 72, section: 104 }

const INK = '#07040f'
const CHALK = '#f4f0ff'
const MIST = '#a99ec7'
const DUSK = '#7d739c'
const VIOLET = '#a855f7'
const CYAN = '#22d3ee'
const GOLD = '#ffc94a'

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

function font(weight: number, size: number): string {
  return `${weight} ${size}px ${FONT}`
}

/** Shrink text until it fits, rather than letting it run off the edge. */
function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  weight: number,
  startSize: number,
  minSize = 24,
): number {
  let size = startSize
  context.font = font(weight, size)
  while (context.measureText(text).width > maxWidth && size > minSize) {
    size -= 4
    context.font = font(weight, size)
  }
  return size
}

/** Wrap into at most `maxLines`, ellipsising whatever will not fit. */
function wrap(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (context.measureText(candidate).width <= maxWidth) {
      line = candidate
      continue
    }
    if (line) lines.push(line)
    line = word
    if (lines.length === maxLines) break
  }

  if (line && lines.length < maxLines) lines.push(line)

  const complete = lines.join(' ') === words.join(' ')
  if (!complete && lines.length > 0) {
    let last = lines[lines.length - 1]
    while (context.measureText(`${last}…`).width > maxWidth && last.length > 1) {
      last = last.slice(0, -1)
    }
    lines[lines.length - 1] = `${last}…`
  }

  return lines
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  context.beginPath()
  context.roundRect(x, y, w, h, r)
}

/** The dark ground and its two colour washes, shared by all three designs. */
function background(context: CanvasRenderingContext2D) {
  context.fillStyle = INK
  context.fillRect(0, 0, SIZE, SIZE)

  const violet = context.createRadialGradient(150, 60, 0, 150, 60, 820)
  violet.addColorStop(0, 'rgba(122, 47, 192, 0.72)')
  violet.addColorStop(1, 'rgba(122, 47, 192, 0)')
  context.fillStyle = violet
  context.fillRect(0, 0, SIZE, SIZE)

  const cyan = context.createRadialGradient(960, 1020, 0, 960, 1020, 700)
  cyan.addColorStop(0, 'rgba(14, 116, 144, 0.55)')
  cyan.addColorStop(1, 'rgba(14, 116, 144, 0)')
  context.fillStyle = cyan
  context.fillRect(0, 0, SIZE, SIZE)
}

/** How tall the footer block is, so layouts know where they must stop. */
const FOOTER_HEIGHT = 118

/** The wordmark, bottom-left on every design. */
function footer(context: CanvasRenderingContext2D, url: string) {
  const top = SIZE - MARGIN - 52
  context.textAlign = 'left'

  context.fillStyle = VIOLET
  roundRect(context, MARGIN, top, 52, 52, 16)
  context.fill()

  context.fillStyle = CYAN
  context.fillRect(MARGIN + 14, top + 14, 10, 10)
  context.fillRect(MARGIN + 32, top + 14, 10, 10)
  context.fillRect(MARGIN + 14, top + 32, 10, 10)
  context.fillRect(MARGIN + 32, top + 32, 10, 10)

  context.fillStyle = CHALK
  context.font = font(700, 32)
  context.fillText('Spendbox', MARGIN + 68, top + 24)

  context.fillStyle = DUSK
  context.font = font(500, 23)
  context.fillText(url.replace(/^https?:\/\//, ''), MARGIN + 68, top + 52)

  context.textAlign = 'center'
}

/** A 3x3 grid with some tiles lit, at any size. */
function miniGrid(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  box: number,
  lit: number[],
) {
  const gap = box * 0.075
  const pad = box * 0.06
  const tile = (box - gap * 2 - pad * 2) / 3

  context.fillStyle = 'rgba(0, 0, 0, 0.4)'
  roundRect(context, x, y, box, box, box * 0.14)
  context.fill()

  for (let index = 0; index < 9; index += 1) {
    const column = index % 3
    const row = Math.floor(index / 3)
    const tx = x + pad + column * (tile + gap)
    const ty = y + pad + row * (tile + gap)

    if (lit.includes(index)) {
      const shine = context.createLinearGradient(tx, ty, tx + tile, ty + tile)
      shine.addColorStop(0, CYAN)
      shine.addColorStop(1, VIOLET)
      context.fillStyle = shine
    } else {
      context.fillStyle = 'rgba(255, 255, 255, 0.06)'
    }

    roundRect(context, tx, ty, tile, tile, tile * 0.26)
    context.fill()
  }
}


/**
 * A block in a flyer: how tall it is, and how to draw it once its top edge is
 * known.
 */
type Block = { height: number; gapAfter: number; draw: (top: number) => void }

/**
 * Stack blocks and centre the whole stack in the space available.
 *
 * The reason for measuring before drawing: a cursor that only moves downward
 * lays a short flyer out correctly but leaves all the slack at the bottom, so a
 * box with no description looks top-heavy and one with a long title looks
 * cramped. Measuring first means the same design breathes evenly whatever the
 * creator typed.
 */
function stack(blocks: Block[], top: number, bottom: number) {
  const available = bottom - top
  const marks = blocks.reduce((total, block) => total + block.height, 0)
  const gaps = blocks
    .slice(0, -1)
    .reduce((total, block) => total + block.gapAfter, 0)

  // Too tall for the space: tighten the gaps rather than let the last block
  // walk over the footer. A long title spends its extra height on air first,
  // and only runs out when there is genuinely nothing left to give.
  const squeeze =
    marks + gaps > available && gaps > 0
      ? Math.max(0.3, (available - marks) / gaps)
      : 1

  const content = marks + gaps * squeeze

  // Centre in what is left. Never start above the area.
  let y = Math.max(top, top + (available - content) / 2)

  for (const [index, block] of blocks.entries()) {
    block.draw(y)
    y += block.height + (index < blocks.length - 1 ? block.gapAfter * squeeze : 0)
  }
}

/** A centred run of text as a block. `y` is the block's top, not a baseline. */
function textBlock(
  context: CanvasRenderingContext2D,
  lines: string[],
  size: number,
  weight: number,
  colour: string | CanvasGradient,
  lineHeight: number,
  gapAfter: number,
): Block {
  return {
    height: lines.length * lineHeight,
    gapAfter,
    draw(top) {
      context.fillStyle = colour
      context.font = font(weight, size)
      lines.forEach((line, index) => {
        // Baselines sit at roughly 78% down each line box.
        context.fillText(line, SIZE / 2, top + index * lineHeight + lineHeight * 0.78)
      })
    },
  }
}

/**
 * Design one — the number, with room around it.
 *
 * For a group chat, where the flyer has about half a second to say what it is.
 */
function drawBold(context: CanvasRenderingContext2D, data: FlyerData) {
  background(context)
  context.textAlign = 'center'

  const inner = SIZE - MARGIN * 2
  const blocks: Block[] = []

  blocks.push(textBlock(context, ['BEAT THE PATTERN · TAKE THE BOX'], 30, 700, GOLD, 40, GAP.loose))

  const gradient = context.createLinearGradient(MARGIN, 0, SIZE - MARGIN, 0)
  gradient.addColorStop(0, GOLD)
  gradient.addColorStop(0.5, '#ffe9a8')
  gradient.addColorStop(1, '#ff9a3c')
  const prizeSize = fitText(context, data.prize, inner, 700, 168, 84)
  blocks.push(
    textBlock(context, [data.prize], prizeSize, 700, gradient, prizeSize * 1.05, GAP.loose),
  )

  context.font = font(600, 44)
  blocks.push(textBlock(context, wrap(context, data.title, inner, 2), 44, 600, CHALK, 58, GAP.normal))

  if (data.description) {
    context.font = font(400, 29)
    const lines = wrap(context, data.description, inner - 60, 2)
    if (lines.length > 0) {
      blocks.push(textBlock(context, lines, 29, 400, MIST, 42, GAP.loose))
    }
  }

  const grid = 200
  blocks.push({
    height: grid,
    gapAfter: GAP.normal,
    draw: (top) => miniGrid(context, SIZE / 2 - grid / 2, top, grid, [0, 4, 5, 7]),
  })

  blocks.push(
    textBlock(context, [`Box ${data.code} · by ${data.creator}`], 27, 500, DUSK, 36, 0),
  )

  stack(blocks, MARGIN + 20, SIZE - MARGIN - FOOTER_HEIGHT)
  footer(context, data.url)
}

/**
 * Design two — the grid, front and centre.
 *
 * For somebody who has never heard of Spendbox: the picture says what the game
 * is before any of the words do.
 */
function drawGrid(context: CanvasRenderingContext2D, data: FlyerData) {
  background(context)
  context.textAlign = 'center'

  const inner = SIZE - MARGIN * 2
  const blocks: Block[] = []

  blocks.push(
    textBlock(context, ['NINE TILES · TEN PATTERNS · ONE PRIZE'], 28, 700, CYAN, 38, GAP.normal),
  )

  const grid = 330
  blocks.push({
    height: grid,
    gapAfter: GAP.loose,
    draw: (top) => miniGrid(context, SIZE / 2 - grid / 2, top, grid, [1, 3, 4, 8]),
  })

  context.font = font(600, 42)
  blocks.push(
    textBlock(context, wrap(context, data.title, inner, 2), 42, 600, CHALK, 54, GAP.tight),
  )

  if (data.description) {
    context.font = font(400, 27)
    const lines = wrap(context, data.description, inner - 60, 1)
    if (lines.length > 0) blocks.push(textBlock(context, lines, 27, 400, MIST, 40, GAP.normal))
  }

  const gradient = context.createLinearGradient(MARGIN, 0, SIZE - MARGIN, 0)
  gradient.addColorStop(0, GOLD)
  gradient.addColorStop(1, '#ff9a3c')
  const prizeSize = fitText(context, data.prize, inner - 120, 700, 104, 60)
  blocks.push(
    textBlock(context, [data.prize], prizeSize, 700, gradient, prizeSize * 1.05, GAP.tight),
  )

  blocks.push(textBlock(context, ['to whoever beats it first'], 26, 500, DUSK, 34, 0))

  stack(blocks, MARGIN, SIZE - MARGIN - FOOTER_HEIGHT)
  footer(context, data.url)
}

/**
 * Design three — a ticket with the code on it.
 *
 * The one that looks like it is worth something, and puts the box code where
 * somebody can read it aloud.
 */
function drawTicket(context: CanvasRenderingContext2D, data: FlyerData) {
  background(context)

  const cardX = MARGIN - 12
  const cardW = SIZE - cardX * 2
  const cardY = 128
  const cardH = SIZE - cardY - MARGIN - FOOTER_HEIGHT + 34
  const tear = cardY + cardH * 0.68

  context.save()
  context.shadowColor = 'rgba(0, 0, 0, 0.55)'
  context.shadowBlur = 60
  context.shadowOffsetY = 18
  context.fillStyle = 'rgba(21, 12, 46, 0.95)'
  roundRect(context, cardX, cardY, cardW, cardH, 44)
  context.fill()
  context.restore()

  context.strokeStyle = 'rgba(168, 85, 247, 0.4)'
  context.lineWidth = 3
  roundRect(context, cardX, cardY, cardW, cardH, 44)
  context.stroke()

  context.strokeStyle = 'rgba(255, 255, 255, 0.14)'
  context.lineWidth = 3
  context.setLineDash([13, 13])
  context.beginPath()
  context.moveTo(cardX + 44, tear)
  context.lineTo(cardX + cardW - 44, tear)
  context.stroke()
  context.setLineDash([])

  context.fillStyle = INK
  context.beginPath()
  context.arc(cardX, tear, 28, 0, Math.PI * 2)
  context.arc(cardX + cardW, tear, 28, 0, Math.PI * 2)
  context.fill()

  context.textAlign = 'center'
  const inner = cardW - 130

  // Above the tear: what it is, and what it is worth.
  const upper: Block[] = []
  upper.push(textBlock(context, ['ONE ATTEMPT · ONE COIN'], 26, 700, GOLD, 34, GAP.normal))

  context.font = font(600, 42)
  upper.push(textBlock(context, wrap(context, data.title, inner, 2), 42, 600, CHALK, 54, GAP.tight))

  if (data.description) {
    context.font = font(400, 26)
    const lines = wrap(context, data.description, inner - 40, 2)
    if (lines.length > 0) upper.push(textBlock(context, lines, 26, 400, MIST, 36, GAP.normal))
  }

  const gradient = context.createLinearGradient(MARGIN, 0, SIZE - MARGIN, 0)
  gradient.addColorStop(0, GOLD)
  gradient.addColorStop(1, '#ff9a3c')
  const prizeSize = fitText(context, data.prize, inner - 60, 700, 118, 66)
  upper.push(textBlock(context, [data.prize], prizeSize, 700, gradient, prizeSize * 1.05, 0))

  stack(upper, cardY + 44, tear - 34)

  // Below the tear: the stub.
  stack(
    [
      textBlock(context, ['BOX CODE'], 25, 600, DUSK, 32, GAP.tight),
      textBlock(context, [data.code], 76, 700, CYAN, 88, 0),
    ],
    tear + 24,
    cardY + cardH - 24,
  )

  footer(context, data.url)
}

const DRAW: Record<FlyerStyle, (c: CanvasRenderingContext2D, d: FlyerData) => void> = {
  bold: drawBold,
  grid: drawGrid,
  ticket: drawTicket,
}

export const FLYER_STYLES: { style: FlyerStyle; name: string; note: string }[] = [
  { style: 'bold', name: 'The number', note: 'Loudest in a busy group chat.' },
  { style: 'grid', name: 'The game', note: 'Shows what the game is at a glance.' },
  { style: 'ticket', name: 'The ticket', note: 'Puts the box code front and centre.' },
]

export const FLYER_SIZE = SIZE

/** Draw one flyer onto a canvas the caller owns. */
export function drawFlyer(canvas: HTMLCanvasElement, style: FlyerStyle, data: FlyerData) {
  canvas.width = SIZE
  canvas.height = SIZE

  const context = canvas.getContext('2d')
  if (!context) return

  context.clearRect(0, 0, SIZE, SIZE)
  DRAW[style](context, data)
}
