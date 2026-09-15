/**
 * A small syntax highlighter.
 *
 * Prism and Shiki are both better at this, and both cost more than the whole
 * rest of the app to download. Since "lightweight" is the point, this covers
 * the four things that actually carry meaning when you glance at code —
 * comments, strings, numbers, keywords — for the languages people paste most,
 * and falls back to plain text for anything else rather than guessing.
 */

export interface Token {
  text: string
  kind: 'plain' | 'comment' | 'string' | 'number' | 'keyword' | 'tag' | 'punct'
}

const KEYWORDS: Record<string, string[]> = {
  javascript:
    'const let var function return if else for while do break continue class extends new this super import export from default async await try catch finally throw typeof instanceof delete void yield null undefined true false switch case in of static get set'.split(
      ' ',
    ),
  typescript:
    'const let var function return if else for while do break continue class extends implements interface type enum new this super import export from default async await try catch finally throw typeof instanceof delete void yield null undefined true false switch case in of static get set public private protected readonly as satisfies keyof infer never unknown any string number boolean'.split(
      ' ',
    ),
  python:
    'def class return if elif else for while break continue import from as pass raise try except finally with lambda yield global nonlocal assert del in is not and or None True False async await match case self'.split(
      ' ',
    ),
  sql: 'select from where group by order having insert into values update set delete create table alter drop join left right inner outer on as and or not null distinct limit offset union all count sum avg min max'.split(
    ' ',
  ),
  css: 'important media supports keyframes import charset font-face root hover focus active before after not nth-child'.split(
    ' ',
  ),
  shell: 'if then else elif fi for while do done case esac function return export local echo cd ls rm mv cp mkdir cat grep sed awk exit source'.split(
    ' ',
  ),
  go: 'func package import return if else for range switch case default break continue var const type struct interface map chan go defer select nil true false make new'.split(
    ' ',
  ),
  rust: 'fn let mut const return if else for while loop match struct enum impl trait pub use mod crate self super where as ref move box dyn unsafe async await true false Some None Ok Err'.split(
    ' ',
  ),
  json: 'true false null'.split(' '),
}

/** Aliases, so a user typing "js" or "py" gets highlighting rather than plain. */
const ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  yml: 'yaml',
  rs: 'rust',
  golang: 'go',
  htm: 'html',
}

export const LANGUAGES = [
  'plain',
  'javascript',
  'typescript',
  'python',
  'html',
  'css',
  'json',
  'sql',
  'shell',
  'go',
  'rust',
  'markdown',
] as const

export function normaliseLang(lang: string): string {
  const key = lang.trim().toLowerCase()
  return ALIASES[key] ?? key
}

/** Comment syntax per language: [lineStart, blockOpen, blockClose]. */
function commentSyntax(lang: string): { line?: string; open?: string; close?: string } {
  if (lang === 'python' || lang === 'shell' || lang === 'yaml' || lang === 'ruby') return { line: '#' }
  if (lang === 'sql') return { line: '--', open: '/*', close: '*/' }
  if (lang === 'css') return { open: '/*', close: '*/' }
  if (lang === 'html' || lang === 'markdown') return { open: '<!--', close: '-->' }
  if (lang === 'json') return {}
  return { line: '//', open: '/*', close: '*/' }
}

export function highlight(code: string, rawLang: string): Token[] {
  const lang = normaliseLang(rawLang)
  if (lang === 'plain' || lang === 'markdown' || !code) return [{ text: code, kind: 'plain' }]

  const keywords = new Set(KEYWORDS[lang] ?? [])
  const comment = commentSyntax(lang)
  const tokens: Token[] = []
  let plain = ''
  let i = 0

  const flush = () => {
    if (plain) {
      tokens.push({ text: plain, kind: 'plain' })
      plain = ''
    }
  }
  const push = (text: string, kind: Token['kind']) => {
    flush()
    tokens.push({ text, kind })
  }

  while (i < code.length) {
    const rest = code.slice(i)

    if (comment.line && rest.startsWith(comment.line)) {
      const end = code.indexOf('\n', i)
      const stop = end === -1 ? code.length : end
      push(code.slice(i, stop), 'comment')
      i = stop
      continue
    }

    if (comment.open && rest.startsWith(comment.open)) {
      const end = code.indexOf(comment.close!, i + comment.open.length)
      const stop = end === -1 ? code.length : end + comment.close!.length
      push(code.slice(i, stop), 'comment')
      i = stop
      continue
    }

    const ch = code[i]

    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1
      // A backslash escapes the next character, so \" does not end the string.
      while (j < code.length && code[j] !== ch) j += code[j] === '\\' ? 2 : 1
      const stop = Math.min(j + 1, code.length)
      push(code.slice(i, stop), 'string')
      i = stop
      continue
    }

    // An HTML tag name, which is the only thing worth colouring in markup.
    if (lang === 'html' && ch === '<') {
      const end = code.indexOf('>', i)
      const stop = end === -1 ? code.length : end + 1
      push(code.slice(i, stop), 'tag')
      i = stop
      continue
    }

    if (/[0-9]/.test(ch) && !/[A-Za-z_]/.test(code[i - 1] ?? '')) {
      let raw = ''
      while (i < code.length && /[0-9a-fA-FxX._]/.test(code[i])) raw += code[i++]
      push(raw, 'number')
      continue
    }

    if (/[A-Za-z_$]/.test(ch)) {
      let word = ''
      while (i < code.length && /[A-Za-z0-9_$]/.test(code[i])) word += code[i++]
      if (keywords.has(word)) push(word, 'keyword')
      else plain += word
      continue
    }

    plain += ch
    i++
  }

  flush()
  return tokens
}
