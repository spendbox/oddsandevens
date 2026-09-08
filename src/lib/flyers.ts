/**
 * The promotional flyers, drawn on a canvas.
 *
 * Three designs, generated in the browser from whatever the box says right
 * now. That is the whole reason they are drawn rather than stored: a creator
 * who renames their box does not have to remember to regenerate anything, and
 * there are no stale PNGs sitting in a bucket advertising an old name.
 *
 * Square, 1080x1080, because that is what every place these get posted wants —
 * WhatsApp status, an Instagram post, an X image. Drawn at that size rather
 * than scaled up, so the text is sharp.
 */

export type FlyerStyle = 'bold' | 'grid' | 'ticket'

export type FlyerData = {
  code: string
  title: string
  prize: string
  creator: string
  url: string
}

const SIZE = 1080

const INK = '#07040f'
const CHALK = '#f4f0ff'
const MIST = '#a99ec7'
const DUSK = '#6f6490'
const VIOLET = '#a855f7'
const CYAN = '#22d3ee'
const GOLD = '#ffc94a'

/** The system font stack, matching the app. */
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

  if (lines.length === maxLines) {
    let last = lines[maxLines - 1]
    while (context.measureText(`${last}…`).width > maxWidth && last.length > 1) {
      last = last.slice(0, -1)
    }
    if (words.join(' ') !== lines.join(' ')) lines[maxLines - 1] = `${last}…`
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

  const violet = context.createRadialGradient(180, 90, 0, 180, 90, 780)
  violet.addColorStop(0, 'rgba(120, 45, 190, 0.75)')
  violet.addColorStop(1, 'rgba(120, 45, 190, 0)')
  context.fillStyle = violet
  context.fillRect(0, 0, SIZE, SIZE)

  const cyan = context.createRadialGradient(940, 1000, 0, 940, 1000, 720)
  cyan.addColorStop(0, 'rgba(14, 116, 144, 0.6)')
  cyan.addColorStop(1, 'rgba(14, 116, 144, 0)')
  context.fillStyle = cyan
  context.fillRect(0, 0, SIZE, SIZE)
}

/** The wordmark, bottom-left on every design. */
function wordmark(context: CanvasRenderingContext2D, url: string) {
  context.fillStyle = VIOLET
  roundRect(context, 80, SIZE - 168, 52, 52, 16)
  context.fill()

  context.fillStyle = CYAN
  context.fillRect(94, SIZE - 154, 10, 10)
  context.fillRect(112, SIZE - 154, 10, 10)
  context.fillRect(94, SIZE - 136, 10, 10)
  context.fillRect(112, SIZE - 136, 10, 10)

  context.fillStyle = CHALK
  context.font = font(700, 34)
  context.textAlign = 'left'
  context.fillText('Spendbox', 148, SIZE - 128)

  context.fillStyle = DUSK
  context.font = font(500, 25)
  context.fillText(url.replace(/^https?:\/\//, ''), 148, SIZE - 92)
}

/** A 3x3 grid with some tiles lit, at any size. */
function miniGrid(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  box: number,
  lit: number[],
) {
  const gap = box * 0.09
  const tile = (box - gap * 2) / 3

  context.fillStyle = 'rgba(0, 0, 0, 0.35)'
  roundRect(context, x - gap, y - gap, box + gap * 2, box + gap * 2, box * 0.13)
  context.fill()

  for (let index = 0; index < 9; index += 1) {
    const column = index % 3
    const row = Math.floor(index / 3)
    const tx = x + column * (tile + gap)
    const ty = y + row * (tile + gap)

    if (lit.includes(index)) {
      const shine = context.createLinearGradient(tx, ty, tx + tile, ty + tile)
      shine.addColorStop(0, CYAN)
      shine.addColorStop(1, VIOLET)
      context.fillStyle = shine
    } else {
      context.fillStyle = 'rgba(255, 255, 255, 0.07)'
    }

    roundRect(context, tx, ty, tile, tile, tile * 0.26)
    context.fill()
  }
}

/**
 * Design one — the number, as big as it goes.
 *
 * For a group chat, where the flyer is competing with everything else on the
 * screen and has about half a second to say what it is.
 */
function drawBold(context: CanvasRenderingContext2D, data: FlyerData) {
  background(context)
  context.textAlign = 'center'

  context.fillStyle = GOLD
  context.font = font(700, 34)
  context.fillText('BEAT THE PATTERN, TAKE THE BOX', SIZE / 2, 175)

  const gradient = context.createLinearGradient(120, 0, 960, 0)
  gradient.addColorStop(0, GOLD)
  gradient.addColorStop(0.5, '#ffe9a8')
  gradient.addColorStop(1, '#ff9a3c')
  context.fillStyle = gradient
  const prizeSize = fitText(context, data.prize, 880, 700, 200, 90)
  context.font = font(700, prizeSize)
  context.fillText(data.prize, SIZE / 2, 390)

  // Laid out with a running cursor from here down, because the title is the
  // creator's text and can be one line or two — and a fixed layout that looks
  // right for one of those quietly overlaps for the other.
  context.fillStyle = CHALK
  context.font = font(600, 46)
  const lines = wrap(context, data.title, 840, 2)

  let y = 470
  for (const line of lines) {
    context.fillText(line, SIZE / 2, y)
    y += 58
  }

  const grid = 200
  y += 30
  miniGrid(context, SIZE / 2 - grid / 2, y, grid, [0, 4, 5, 7])
  y += grid + 62

  context.fillStyle = MIST
  context.font = font(500, 32)
  context.fillText(`Box ${data.code} · by ${data.creator}`, SIZE / 2, y)

  wordmark(context, data.url)
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

  context.fillStyle = CYAN
  context.font = font(700, 32)
  context.fillText('NINE TILES · TEN PATTERNS · ONE PRIZE', SIZE / 2, 140)

  const grid = 370
  miniGrid(context, SIZE / 2 - grid / 2, 190, grid, [1, 3, 4, 8])

  context.fillStyle = CHALK
  context.font = font(600, 44)
  const lines = wrap(context, data.title, 840, 2)

  let y = 640
  for (const line of lines) {
    context.fillText(line, SIZE / 2, y)
    y += 54
  }

  const gradient = context.createLinearGradient(200, 0, 880, 0)
  gradient.addColorStop(0, GOLD)
  gradient.addColorStop(1, '#ff9a3c')
  context.fillStyle = gradient
  const prizeSize = fitText(context, data.prize, 700, 700, 118, 64)
  context.font = font(700, prizeSize)
  y += 44
  context.fillText(data.prize, SIZE / 2, y)

  context.fillStyle = MIST
  context.font = font(500, 30)
  context.fillText('to whoever beats it first', SIZE / 2, y + 44)

  wordmark(context, data.url)
}

/**
 * Design three — a torn ticket with the code on it.
 *
 * The one that looks like it is worth something, and puts the box code where
 * somebody can read it aloud.
 */
function drawTicket(context: CanvasRenderingContext2D, data: FlyerData) {
  background(context)

  context.save()
  context.shadowColor = 'rgba(0, 0, 0, 0.55)'
  context.shadowBlur = 60
  context.shadowOffsetY = 20
  context.fillStyle = 'rgba(21, 12, 46, 0.94)'
  roundRect(context, 110, 150, 860, 700, 48)
  context.fill()
  context.restore()

  context.strokeStyle = 'rgba(168, 85, 247, 0.45)'
  context.lineWidth = 3
  roundRect(context, 110, 150, 860, 700, 48)
  context.stroke()

  // The perforation across the middle of the ticket.
  context.strokeStyle = 'rgba(255, 255, 255, 0.16)'
  context.lineWidth = 3
  context.setLineDash([14, 14])
  context.beginPath()
  context.moveTo(150, 620)
  context.lineTo(930, 620)
  context.stroke()
  context.setLineDash([])

  context.fillStyle = INK
  context.beginPath()
  context.arc(110, 620, 30, 0, Math.PI * 2)
  context.arc(970, 620, 30, 0, Math.PI * 2)
  context.fill()

  context.textAlign = 'center'

  context.fillStyle = GOLD
  context.font = font(700, 30)
  context.fillText('ONE ATTEMPT · ONE COIN', SIZE / 2, 250)

  context.fillStyle = CHALK
  context.font = font(600, 44)
  const lines = wrap(context, data.title, 720, 2)
  lines.forEach((line, index) => context.fillText(line, SIZE / 2, 330 + index * 56))

  const gradient = context.createLinearGradient(200, 0, 880, 0)
  gradient.addColorStop(0, GOLD)
  gradient.addColorStop(1, '#ff9a3c')
  context.fillStyle = gradient
  const prizeSize = fitText(context, data.prize, 640, 700, 150, 80)
  context.font = font(700, prizeSize)
  context.fillText(data.prize, SIZE / 2, 500 + (lines.length - 1) * 40)

  context.fillStyle = DUSK
  context.font = font(600, 28)
  context.fillText('BOX CODE', SIZE / 2, 700)

  context.fillStyle = CYAN
  context.font = font(700, 92)
  context.fillText(data.code, SIZE / 2, 790)

  wordmark(context, data.url)
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

/** Draw one flyer onto a canvas the caller owns. */
export function drawFlyer(canvas: HTMLCanvasElement, style: FlyerStyle, data: FlyerData) {
  canvas.width = SIZE
  canvas.height = SIZE

  const context = canvas.getContext('2d')
  if (!context) return

  context.clearRect(0, 0, SIZE, SIZE)
  DRAW[style](context, data)
}
