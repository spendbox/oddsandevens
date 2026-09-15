/**
 * A small spreadsheet formula engine.
 *
 * A grid of text boxes is not a spreadsheet. The thing that makes it one is
 * that a cell can refer to other cells and recompute when they change, so
 * this is the minimum that earns the word: arithmetic, cell references,
 * ranges, and the handful of functions people actually reach for.
 *
 * It is deliberately not a parser generator or an expression library. The
 * whole engine is a tokeniser and a recursive-descent parser, which keeps it
 * readable and keeps it out of the download the user waits on.
 */

export type CellValue = number | string | boolean

/** "A1" -> { col: 0, row: 0 }. Returns null for anything that is not a reference. */
export function parseRef(ref: string): { col: number; row: number } | null {
  const match = /^([A-Z]+)([0-9]+)$/.exec(ref.toUpperCase())
  if (!match) return null
  let col = 0
  for (const ch of match[1]) col = col * 26 + (ch.charCodeAt(0) - 64)
  const row = Number(match[2])
  if (row < 1) return null
  return { col: col - 1, row: row - 1 }
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function colName(index: number): string {
  let name = ''
  let n = index + 1
  while (n > 0) {
    const rem = (n - 1) % 26
    name = String.fromCharCode(65 + rem) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

export function cellKey(col: number, row: number): string {
  return `${colName(col)}${row + 1}`
}

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'ref'; value: string }
  | { kind: 'name'; value: string }
  | { kind: 'op'; value: string }

function tokenise(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (ch === ' ' || ch === '\t') {
      i++
      continue
    }
    if (ch === '"') {
      let value = ''
      i++
      while (i < input.length && input[i] !== '"') value += input[i++]
      i++
      tokens.push({ kind: 'str', value })
      continue
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(input[i + 1] ?? ''))) {
      let raw = ''
      while (i < input.length && /[0-9.]/.test(input[i])) raw += input[i++]
      tokens.push({ kind: 'num', value: Number(raw) })
      continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      let raw = ''
      while (i < input.length && /[A-Za-z0-9_]/.test(input[i])) raw += input[i++]
      // A name followed by "(" is a function call; otherwise a bare word that
      // looks like A1 is a cell reference and anything else is a named value.
      const isCall = input[i] === '('
      if (!isCall && parseRef(raw)) tokens.push({ kind: 'ref', value: raw.toUpperCase() })
      else tokens.push({ kind: 'name', value: raw.toUpperCase() })
      continue
    }
    // Two-character comparisons have to be tried before the single ones.
    const two = input.slice(i, i + 2)
    if (two === '<=' || two === '>=' || two === '<>') {
      tokens.push({ kind: 'op', value: two })
      i += 2
      continue
    }
    tokens.push({ kind: 'op', value: ch })
    i++
  }
  return tokens
}

/** Thrown for anything the user can fix by editing the formula. */
class FormulaError extends Error {}

interface Ctx {
  /** Raw contents of a cell, or undefined for an empty one. */
  raw: (key: string) => string | undefined
  /** Cells currently being evaluated, so a cycle is caught rather than hung. */
  visiting: Set<string>
  /** Results already computed in this pass. */
  cache: Map<string, CellValue>
}

function toNumber(value: CellValue): number {
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value === '') return 0
  const n = Number(value)
  if (Number.isNaN(n)) throw new FormulaError('not a number')
  return n
}

function makeParser(tokens: Token[], ctx: Ctx) {
  let pos = 0
  const peek = () => tokens[pos]
  const eat = (value: string) => {
    const token = peek()
    if (token && token.kind === 'op' && token.value === value) {
      pos++
      return true
    }
    return false
  }

  /** Expands A1:B3 into every key it covers. */
  function expandRange(from: string, to: string): string[] {
    const a = parseRef(from)
    const b = parseRef(to)
    if (!a || !b) throw new FormulaError('bad range')
    const keys: string[] = []
    for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) {
      for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) {
        keys.push(cellKey(c, r))
      }
    }
    return keys
  }

  /**
   * Arguments arrive flattened: SUM(A1:A9, B1) is one list of values, because
   * every function here treats a range and a list of cells the same way.
   */
  function args(): CellValue[] {
    const out: CellValue[] = []
    if (eat(')')) return out
    do {
      const token = peek()
      const after = tokens[pos + 1]
      if (token?.kind === 'ref' && after?.kind === 'op' && after.value === ':') {
        const third = tokens[pos + 2]
        if (third?.kind !== 'ref') throw new FormulaError('bad range')
        pos += 3
        for (const key of expandRange(token.value, third.value)) out.push(cellRef(key))
        continue
      }
      out.push(expr())
    } while (eat(','))
    if (!eat(')')) throw new FormulaError('missing )')
    return out
  }

  function cellRef(key: string): CellValue {
    return evaluateCell(key, ctx)
  }

  function primary(): CellValue {
    const token = peek()
    if (!token) throw new FormulaError('unexpected end')
    if (token.kind === 'num') {
      pos++
      return token.value
    }
    if (token.kind === 'str') {
      pos++
      return token.value
    }
    if (token.kind === 'ref') {
      pos++
      return cellRef(token.value)
    }
    if (token.kind === 'name') {
      pos++
      if (eat('(')) return callFunction(token.value, args())
      if (token.value === 'TRUE') return true
      if (token.value === 'FALSE') return false
      throw new FormulaError(`unknown name ${token.value}`)
    }
    if (token.kind === 'op' && token.value === '(') {
      pos++
      const value = expr()
      if (!eat(')')) throw new FormulaError('missing )')
      return value
    }
    if (token.kind === 'op' && (token.value === '-' || token.value === '+')) {
      pos++
      const value = toNumber(primary())
      return token.value === '-' ? -value : value
    }
    throw new FormulaError('unexpected input')
  }

  /**
   * Left-associative, so 2^3^2 is 64. That is what Excel and Google Sheets
   * do; the maths convention of right-association would give 512 and surprise
   * anybody carrying a formula across from a real spreadsheet.
   */
  function power(): CellValue {
    let left = primary()
    while (peek()?.kind === 'op' && peek().value === '^') {
      pos++
      left = toNumber(left) ** toNumber(primary())
    }
    return left
  }

  function term(): CellValue {
    let left = power()
    for (;;) {
      const token = peek()
      if (token?.kind !== 'op' || (token.value !== '*' && token.value !== '/')) return left
      pos++
      const right = toNumber(power())
      if (token.value === '/' && right === 0) throw new FormulaError('divide by zero')
      left = token.value === '*' ? toNumber(left) * right : toNumber(left) / right
    }
  }

  function sum(): CellValue {
    let left = term()
    for (;;) {
      const token = peek()
      if (token?.kind !== 'op' || (token.value !== '+' && token.value !== '-' && token.value !== '&')) {
        return left
      }
      pos++
      const right = term()
      // "&" joins text, the one operator here that is not arithmetic.
      if (token.value === '&') left = `${display(left)}${display(right)}`
      else if (token.value === '+') left = toNumber(left) + toNumber(right)
      else left = toNumber(left) - toNumber(right)
    }
  }

  function expr(): CellValue {
    let left = sum()
    for (;;) {
      const token = peek()
      if (token?.kind !== 'op' || !['=', '<', '>', '<=', '>=', '<>'].includes(token.value)) {
        return left
      }
      pos++
      const right = sum()
      const a = typeof left === 'string' || typeof right === 'string' ? display(left) : toNumber(left)
      const b = typeof left === 'string' || typeof right === 'string' ? display(right) : toNumber(right)
      switch (token.value) {
        case '=':
          left = a === b
          break
        case '<>':
          left = a !== b
          break
        case '<':
          left = a < b
          break
        case '>':
          left = a > b
          break
        case '<=':
          left = a <= b
          break
        default:
          left = a >= b
      }
    }
  }

  return {
    parse(): CellValue {
      const value = expr()
      if (pos < tokens.length) throw new FormulaError('trailing input')
      return value
    },
    /** IF has to see its branches unevaluated, so it is handled in the parser. */
    callFunction,
  }
}

function numbers(values: CellValue[]): number[] {
  // Blank cells are skipped rather than counted as zero: averaging a column
  // with gaps should not be dragged down by rows nobody has filled in.
  return values.filter((v) => v !== '' && v !== null && v !== undefined).map(toNumber)
}

function display(value: CellValue): string {
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new FormulaError('not a number')
    // Floating point makes 0.1+0.2 print 15 decimal places of noise.
    return String(Math.round(value * 1e10) / 1e10)
  }
  return String(value)
}

function callFunction(name: string, values: CellValue[]): CellValue {
  switch (name) {
    case 'SUM':
      return numbers(values).reduce((a, b) => a + b, 0)
    case 'AVG':
    case 'AVERAGE': {
      const ns = numbers(values)
      if (!ns.length) throw new FormulaError('no numbers')
      return ns.reduce((a, b) => a + b, 0) / ns.length
    }
    case 'MIN': {
      const ns = numbers(values)
      if (!ns.length) throw new FormulaError('no numbers')
      return Math.min(...ns)
    }
    case 'MAX': {
      const ns = numbers(values)
      if (!ns.length) throw new FormulaError('no numbers')
      return Math.max(...ns)
    }
    case 'COUNT':
      return numbers(values).length
    case 'COUNTA':
      return values.filter((v) => v !== '').length
    case 'ROUND': {
      const [value, places = 0] = values
      const factor = 10 ** toNumber(places)
      return Math.round(toNumber(value) * factor) / factor
    }
    case 'ABS':
      return Math.abs(toNumber(values[0]))
    case 'SQRT':
      return Math.sqrt(toNumber(values[0]))
    case 'INT':
      return Math.floor(toNumber(values[0]))
    case 'IF': {
      const [test, yes = true, no = false] = values
      const truthy = typeof test === 'boolean' ? test : toNumber(test) !== 0
      return truthy ? yes : no
    }
    case 'LEN':
      return display(values[0] ?? '').length
    case 'UPPER':
      return display(values[0] ?? '').toUpperCase()
    case 'LOWER':
      return display(values[0] ?? '').toLowerCase()
    case 'CONCAT':
      return values.map(display).join('')
    case 'TODAY':
      return new Date().toISOString().slice(0, 10)
    default:
      throw new FormulaError(`unknown function ${name}`)
  }
}

function evaluateCell(key: string, ctx: Ctx): CellValue {
  const cached = ctx.cache.get(key)
  if (cached !== undefined) return cached
  // A cell that refers to itself, directly or around a loop, would recurse
  // until the tab died. Catching it here turns a hang into a visible #CYCLE.
  if (ctx.visiting.has(key)) throw new FormulaError('circular reference')

  const raw = ctx.raw(key)
  if (raw === undefined || raw === '') return ''

  if (!raw.startsWith('=')) {
    const asNumber = Number(raw)
    const value: CellValue = raw.trim() !== '' && !Number.isNaN(asNumber) ? asNumber : raw
    ctx.cache.set(key, value)
    return value
  }

  ctx.visiting.add(key)
  try {
    const value = makeParser(tokenise(raw.slice(1)), ctx).parse()
    ctx.cache.set(key, value)
    return value
  } finally {
    ctx.visiting.delete(key)
  }
}

export interface Computed {
  /** What to paint in the cell. */
  text: string
  /** True when the cell holds a formula, so the grid can mark it. */
  formula: boolean
  error: boolean
  /** Numbers are right-aligned, the way every spreadsheet does it. */
  numeric: boolean
}

/**
 * Computes every cell in one pass, sharing a cache so a column of formulas
 * that all read the same total does not recompute it once per row.
 */
export function computeGrid(cells: Record<string, string>): Record<string, Computed> {
  const ctx: Ctx = {
    raw: (key) => cells[key],
    visiting: new Set(),
    cache: new Map(),
  }
  const out: Record<string, Computed> = {}
  for (const key of Object.keys(cells)) {
    const raw = cells[key]
    if (raw === '' || raw === undefined) continue
    const isFormula = raw.startsWith('=')
    try {
      const value = evaluateCell(key, ctx)
      out[key] = {
        text: display(value),
        formula: isFormula,
        error: false,
        numeric: typeof value === 'number',
      }
    } catch (error) {
      const message = error instanceof FormulaError ? error.message : 'error'
      out[key] = {
        text: message === 'circular reference' ? '#CYCLE' : '#ERROR',
        formula: isFormula,
        error: true,
        numeric: false,
      }
    }
  }
  return out
}
