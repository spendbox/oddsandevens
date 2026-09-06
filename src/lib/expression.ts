/**
 * A very small arithmetic evaluator for member-built calculators.
 *
 * The formula in a tool is written by one member and run in everybody else's
 * browser, so it never goes near eval or new Function. This parses a fixed
 * grammar — numbers, named inputs, + - * / %, parentheses — and anything
 * outside it is rejected rather than interpreted.
 */

type Token = { type: 'number' | 'name' | 'op' | 'paren'; value: string }

const OPERATORS: Record<string, { precedence: number; apply: (a: number, b: number) => number }> = {
  '+': { precedence: 1, apply: (a, b) => a + b },
  '-': { precedence: 1, apply: (a, b) => a - b },
  '*': { precedence: 2, apply: (a, b) => a * b },
  '/': { precedence: 2, apply: (a, b) => (b === 0 ? NaN : a / b) },
  '%': { precedence: 2, apply: (a, b) => (b === 0 ? NaN : a % b) },
  '^': { precedence: 3, apply: (a, b) => a ** b },
}

export class FormulaError extends Error {}

function tokenise(formula: string): Token[] {
  const tokens: Token[] = []
  let index = 0

  while (index < formula.length) {
    const char = formula[index]

    if (/\s/.test(char)) {
      index += 1
      continue
    }

    if (/[0-9.]/.test(char)) {
      let number = ''
      while (index < formula.length && /[0-9.]/.test(formula[index])) number += formula[index++]
      if (Number.isNaN(Number(number))) throw new FormulaError(`"${number}" is not a number`)
      tokens.push({ type: 'number', value: number })
      continue
    }

    if (/[a-zA-Z_]/.test(char)) {
      let name = ''
      while (index < formula.length && /[a-zA-Z0-9_]/.test(formula[index])) name += formula[index++]
      tokens.push({ type: 'name', value: name })
      continue
    }

    if (char in OPERATORS) {
      tokens.push({ type: 'op', value: char })
      index += 1
      continue
    }

    if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char })
      index += 1
      continue
    }

    throw new FormulaError(`"${char}" is not allowed in a formula`)
  }

  return tokens
}

/** Shunting-yard: infix tokens to reverse Polish, so evaluation needs no recursion. */
function toPostfix(tokens: Token[]): Token[] {
  const output: Token[] = []
  const stack: Token[] = []

  for (const token of tokens) {
    if (token.type === 'number' || token.type === 'name') {
      output.push(token)
    } else if (token.type === 'op') {
      while (
        stack.length > 0 &&
        stack[stack.length - 1].type === 'op' &&
        OPERATORS[stack[stack.length - 1].value].precedence >= OPERATORS[token.value].precedence
      ) {
        output.push(stack.pop()!)
      }
      stack.push(token)
    } else if (token.value === '(') {
      stack.push(token)
    } else {
      while (stack.length > 0 && stack[stack.length - 1].value !== '(') output.push(stack.pop()!)
      if (stack.length === 0) throw new FormulaError('A closing bracket has no opening bracket')
      stack.pop()
    }
  }

  while (stack.length > 0) {
    const token = stack.pop()!
    if (token.value === '(') throw new FormulaError('A bracket was never closed')
    output.push(token)
  }

  return output
}

/** Run a formula against named values. Returns null when it cannot be computed. */
export function evaluateFormula(formula: string, values: Record<string, number>): number | null {
  if (!formula.trim()) return null

  const postfix = toPostfix(tokenise(formula))
  const stack: number[] = []

  for (const token of postfix) {
    if (token.type === 'number') {
      stack.push(Number(token.value))
    } else if (token.type === 'name') {
      const value = values[token.value]
      if (value === undefined || Number.isNaN(value)) return null
      stack.push(value)
    } else {
      const right = stack.pop()
      const left = stack.pop()
      if (left === undefined || right === undefined) throw new FormulaError('The formula is incomplete')
      stack.push(OPERATORS[token.value].apply(left, right))
    }
  }

  if (stack.length !== 1) throw new FormulaError('The formula is incomplete')
  const result = stack[0]
  return Number.isFinite(result) ? result : null
}

/** Every input name a formula refers to — used to check a tool before saving it. */
export function namesUsed(formula: string): string[] {
  try {
    return [...new Set(tokenise(formula).filter((t) => t.type === 'name').map((t) => t.value))]
  } catch {
    return []
  }
}

/** Validate a member's formula at save time, so it cannot be broken for others. */
export function checkFormula(formula: string, inputKeys: string[]): string | null {
  if (!formula.trim()) return 'Write a formula, for example: savings / burn'

  let used: string[]
  try {
    used = namesUsed(formula)
    evaluateFormula(formula, Object.fromEntries(inputKeys.map((key) => [key, 1])))
  } catch (error) {
    return error instanceof FormulaError ? error.message : 'That formula could not be read'
  }

  const unknown = used.filter((name) => !inputKeys.includes(name))
  if (unknown.length > 0) {
    return `The formula uses ${unknown.map((n) => `"${n}"`).join(', ')}, which ${
      unknown.length === 1 ? 'is not an input' : 'are not inputs'
    }. Add ${unknown.length === 1 ? 'it' : 'them'} above, or correct the spelling.`
  }

  return null
}
