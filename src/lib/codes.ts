/**
 * Box codes — the short thing at the end of a share link.
 *
 * Six characters from an alphabet with no 0/O and no 1/I/L, because these get
 * read aloud and typed by hand. That is about 700 million codes, and the column
 * is unique, so a collision is a retry rather than a bug.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function makeBoxCode(length = 6): string {
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)

  let code = ''
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length]
  return code
}

/** Codes are shown in capitals but a pasted link should work either way. */
export function tidyBoxCode(raw: string): string {
  return raw.trim().toUpperCase().slice(0, 12)
}
