/**
 * A small, safe expression language for creator-authored formulas.
 *
 * One person writes a formula and everybody else's browser runs it, so this
 * never goes near `eval` or `new Function`. It parses a fixed grammar —
 * numbers, named inputs, arithmetic, comparisons, and a short list of
 * functions — and refuses anything outside it.
 *
 *   savings / burn
 *   if(income > 800000, income * 0.24, income * 0.15)
 *   min(value * 0.35, 2000000) + round(duty)
 */

export class FormulaError extends Error {}

type Token =
  | { type: 'number'; value: number }
  | { type: 'name'; value: string }
  | { type: 'op'; value: string }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'comma' }

const BINARY: Record<string, { precedence: number; apply: (a: number, b: number) => number }> = {
  '||': { precedence: 1, apply: (a, b) => (a !== 0 ? a : b) },
  '&&': { precedence: 2, apply: (a, b) => (a !== 0 && b !== 0 ? 1 : 0) },
  '==': { precedence: 3, apply: (a, b) => (a === b ? 1 : 0) },
  '!=': { precedence: 3, apply: (a, b) => (a !== b ? 1 : 0) },
  '<': { precedence: 4, apply: (a, b) => (a < b ? 1 : 0) },
  '<=': { precedence: 4, apply: (a, b) => (a <= b ? 1 : 0) },
  '>': { precedence: 4, apply: (a, b) => (a > b ? 1 : 0) },
  '>=': { precedence: 4, apply: (a, b) => (a >= b ? 1 : 0) },
  '+': { precedence: 5, apply: (a, b) => a + b },
  '-': { precedence: 5, apply: (a, b) => a - b },
  '*': { precedence: 6, apply: (a, b) => a * b },
  '/': { precedence: 6, apply: (a, b) => (b === 0 ? NaN : a / b) },
  '%': { precedence: 6, apply: (a, b) => (b === 0 ? NaN : a % b) },
  '^': { precedence: 7, apply: (a, b) => a ** b },
}

/** Everything a formula is allowed to call, and how many arguments it takes. */
export const FUNCTIONS: Record<string, { arity: number | 'many'; apply: (args: number[]) => number }> = {
  min: { arity: 'many', apply: (a) => Math.min(...a) },
  max: { arity: 'many', apply: (a) => Math.max(...a) },
  round: { arity: 1, apply: ([a]) => Math.round(a) },
  floor: { arity: 1, apply: ([a]) => Math.floor(a) },
  ceil: { arity: 1, apply: ([a]) => Math.ceil(a) },
  abs: { arity: 1, apply: ([a]) => Math.abs(a) },
  sqrt: { arity: 1, apply: ([a]) => (a < 0 ? NaN : Math.sqrt(a)) },
  // if(condition, then, otherwise) — what makes tax bands and tiered pricing
  // expressible without giving creators a programming language.
  if: { arity: 3, apply: ([test, yes, no]) => (test !== 0 ? yes : no) },
}

const TWO_CHAR = new Set(['<=', '>=', '==', '!=', '&&', '||'])

function tokenise(formula: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < formula.length) {
    const char = formula[i]

    if (/\s/.test(char)) {
      i += 1
      continue
    }

    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(formula[i + 1] ?? ''))) {
      let raw = ''
      while (i < formula.length && /[0-9._]/.test(formula[i])) raw += formula[i++]
      const value = Number(raw.replace(/_/g, ''))
      if (Number.isNaN(value)) throw new FormulaError(`"${raw}" is not a number`)
      tokens.push({ type: 'number', value })
      continue
    }

    if (/[a-zA-Z_]/.test(char)) {
      let name = ''
      while (i < formula.length && /[a-zA-Z0-9_]/.test(formula[i])) name += formula[i++]
      tokens.push({ type: 'name', value: name })
      continue
    }

    const pair = formula.slice(i, i + 2)
    if (TWO_CHAR.has(pair)) {
      tokens.push({ type: 'op', value: pair })
      i += 2
      continue
    }

    if (char in BINARY) {
      tokens.push({ type: 'op', value: char })
      i += 1
      continue
    }

    if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char })
      i += 1
      continue
    }

    if (char === ',') {
      tokens.push({ type: 'comma' })
      i += 1
      continue
    }

    throw new FormulaError(`"${char}" is not allowed in a formula`)
  }

  return tokens
}

type Node =
  | { kind: 'number'; value: number }
  | { kind: 'name'; value: string }
  | { kind: 'binary'; op: string; left: Node; right: Node }
  | { kind: 'negate'; value: Node }
  | { kind: 'call'; name: string; args: Node[] }

/**
 * Recursive descent, which handles function calls and unary minus far more
 * readably than shunting-yard once commas are in the grammar.
 */
function parse(tokens: Token[]): Node {
  let position = 0
  const peek = () => tokens[position]

  function parseExpression(minPrecedence = 0): Node {
    let left = parseUnary()

    for (;;) {
      const token = peek()
      if (!token || token.type !== 'op') break
      const operator = BINARY[token.value]
      if (!operator || operator.precedence < minPrecedence) break
      position += 1
      const right = parseExpression(operator.precedence + 1)
      left = { kind: 'binary', op: token.value, left, right }
    }

    return left
  }

  function parseUnary(): Node {
    const token = peek()
    if (token && token.type === 'op' && token.value === '-') {
      position += 1
      return { kind: 'negate', value: parseUnary() }
    }
    if (token && token.type === 'op' && token.value === '+') {
      position += 1
      return parseUnary()
    }
    return parseAtom()
  }

  function parseAtom(): Node {
    const token = peek()
    if (!token) throw new FormulaError('The formula ends too early')

    if (token.type === 'number') {
      position += 1
      return { kind: 'number', value: token.value }
    }

    if (token.type === 'name') {
      position += 1
      const next = peek()
      if (next && next.type === 'paren' && next.value === '(') {
        position += 1
        const args: Node[] = []
        if (!(peek()?.type === 'paren' && (peek() as { value: string }).value === ')')) {
          for (;;) {
            args.push(parseExpression())
            const separator = peek()
            if (separator && separator.type === 'comma') {
              position += 1
              continue
            }
            break
          }
        }
        const closing = peek()
        if (!closing || closing.type !== 'paren' || closing.value !== ')') {
          throw new FormulaError(`"${token.value}(" was never closed`)
        }
        position += 1
        return { kind: 'call', name: token.value, args }
      }
      return { kind: 'name', value: token.value }
    }

    if (token.type === 'paren' && token.value === '(') {
      position += 1
      const inner = parseExpression()
      const closing = peek()
      if (!closing || closing.type !== 'paren' || closing.value !== ')') {
        throw new FormulaError('A bracket was never closed')
      }
      position += 1
      return inner
    }

    throw new FormulaError('The formula could not be read')
  }

  const tree = parseExpression()
  if (position < tokens.length) throw new FormulaError('There is something extra at the end')
  return tree
}

function run(node: Node, values: Record<string, number>): number {
  switch (node.kind) {
    case 'number':
      return node.value
    case 'name': {
      const value = values[node.value]
      if (value === undefined || Number.isNaN(value)) return NaN
      return value
    }
    case 'negate':
      return -run(node.value, values)
    case 'binary':
      return BINARY[node.op].apply(run(node.left, values), run(node.right, values))
    case 'call': {
      const fn = FUNCTIONS[node.name]
      if (!fn) throw new FormulaError(`"${node.name}" is not a function you can use here`)
      if (fn.arity !== 'many' && node.args.length !== fn.arity) {
        throw new FormulaError(
          `${node.name}() takes ${fn.arity} ${fn.arity === 1 ? 'value' : 'values'}, not ${node.args.length}`,
        )
      }
      if (fn.arity === 'many' && node.args.length === 0) {
        throw new FormulaError(`${node.name}() needs at least one value`)
      }
      // if() must not evaluate both branches eagerly — a divide by zero in the
      // branch that was not taken should not poison the result.
      if (node.name === 'if') {
        return run(node.args[0], values) !== 0
          ? run(node.args[1], values)
          : run(node.args[2], values)
      }
      return fn.apply(node.args.map((argument) => run(argument, values)))
    }
  }
}

/** Run a formula. Returns null when a value it needs is missing or the result is not finite. */
export function evaluateFormula(formula: string, values: Record<string, number>): number | null {
  if (!formula.trim()) return null
  const result = run(parse(tokenise(formula)), values)
  return Number.isFinite(result) ? result : null
}

/** Every name a formula reads — used to check it before it is saved. */
export function namesUsed(formula: string): string[] {
  const names = new Set<string>()
  const walk = (node: Node) => {
    if (node.kind === 'name') names.add(node.value)
    else if (node.kind === 'binary') {
      walk(node.left)
      walk(node.right)
    } else if (node.kind === 'negate') walk(node.value)
    else if (node.kind === 'call') node.args.forEach(walk)
  }
  try {
    walk(parse(tokenise(formula)))
  } catch {
    return []
  }
  return [...names]
}

/**
 * Check a formula at save time, so a broken one never reaches anybody else.
 * Returns a message a person can act on, or null when it is fine.
 */
export function checkFormula(formula: string, available: string[]): string | null {
  if (!formula.trim()) return 'Write a formula, for example: price * quantity'

  let names: string[]
  try {
    const tree = parse(tokenise(formula))
    names = namesUsed(formula)
    run(tree, Object.fromEntries(available.map((key) => [key, 1])))
  } catch (error) {
    return error instanceof FormulaError ? error.message : 'That formula could not be read'
  }

  const unknown = names.filter((name) => !available.includes(name))
  if (unknown.length > 0) {
    return `${unknown.map((n) => `"${n}"`).join(', ')} ${
      unknown.length === 1 ? 'is not an input' : 'are not inputs'
    } on this tool. Add ${unknown.length === 1 ? 'it' : 'them'}, or check the spelling.`
  }

  return null
}
