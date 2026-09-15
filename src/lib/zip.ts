/**
 * Reading and writing ZIP archives, which is all a .docx really is.
 *
 * Written by hand rather than with a library because the browser already has
 * the hard part: `DecompressionStream('deflate-raw')` and its counterpart do
 * the actual compression. What is left is the container format — a few
 * headers and a checksum — which is about two hundred lines.
 *
 * The alternative was mammoth (2.1MB unpacked) for reading and a docx writer
 * for the other direction. For a feature most people will use twice, that is
 * four times the size of the entire app.
 *
 * Only what a .docx needs is supported: stored and deflated entries, no
 * encryption, no ZIP64, no multi-disk. Anything else reports rather than
 * guesses.
 */

const SIGNATURE = {
  LOCAL: 0x04034b50,
  CENTRAL: 0x02014b50,
  EOCD: 0x06054b50,
} as const

/** CRC-32, built once. Every ZIP entry carries one and readers check it. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Whether this browser can do the compression a .docx needs. */
export function zipSupported(): boolean {
  return typeof DecompressionStream !== 'undefined' && typeof CompressionStream !== 'undefined'
}

/**
 * Every file in the archive, by name.
 *
 * Read through the central directory rather than by walking local headers:
 * a local header may carry zero sizes with the real ones in a trailing data
 * descriptor, and the central directory always has the truth.
 */
export async function readZip(data: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const decoder = new TextDecoder()

  // The end-of-central-directory record sits at the end, after a comment of
  // unknown length, so it has to be searched for backwards.
  let eocd = -1
  for (let i = data.length - 22; i >= 0 && i > data.length - 22 - 0xffff; i--) {
    if (view.getUint32(i, true) === SIGNATURE.EOCD) {
      eocd = i
      break
    }
  }
  if (eocd === -1) throw new Error('not a zip archive')

  const entryCount = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)

  const files = new Map<string, Uint8Array>()
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(offset, true) !== SIGNATURE.CENTRAL) throw new Error('damaged zip directory')
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const name = decoder.decode(data.subarray(offset + 46, offset + 46 + nameLength))

    // The local header's own name and extra lengths can differ from the
    // central directory's, so the data offset must be read from the local one.
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const raw = data.subarray(dataStart, dataStart + compressedSize)

    if (method === 0) files.set(name, raw)
    else if (method === 8) files.set(name, await inflateRaw(raw))
    else throw new Error(`unsupported compression in ${name}`)

    offset += 46 + nameLength + extraLength + commentLength
  }
  return files
}

/** Writes an archive. Entries are deflated, which every reader understands. */
export async function writeZip(files: Map<string, Uint8Array>): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const [name, content] of files) {
    const nameBytes = encoder.encode(name)
    const checksum = crc32(content)
    const deflated = await deflateRaw(content)
    // Deflate can make tiny or already-dense files bigger; store those.
    const useDeflate = deflated.length < content.length
    const payload = useDeflate ? deflated : content
    const method = useDeflate ? 8 : 0

    const local = new Uint8Array(30 + nameBytes.length + payload.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, SIGNATURE.LOCAL, true)
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0, true) // flags
    lv.setUint16(8, method, true)
    lv.setUint16(10, 0, true) // time
    lv.setUint16(12, 0x21, true) // date: 1 Jan 1980, the ZIP epoch
    lv.setUint32(14, checksum, true)
    lv.setUint32(18, payload.length, true)
    lv.setUint32(22, content.length, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)
    local.set(nameBytes, 30)
    local.set(payload, 30 + nameBytes.length)
    locals.push(local)

    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, SIGNATURE.CENTRAL, true)
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, 0, true)
    cv.setUint16(10, method, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0x21, true)
    cv.setUint32(16, checksum, true)
    cv.setUint32(20, payload.length, true)
    cv.setUint32(24, content.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true)
    cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true)
    cv.setUint32(38, 0, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centrals.push(central)

    offset += local.length
  }

  const directorySize = centrals.reduce((sum, c) => sum + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, SIGNATURE.EOCD, true)
  ev.setUint16(8, centrals.length, true)
  ev.setUint16(10, centrals.length, true)
  ev.setUint32(12, directorySize, true)
  ev.setUint32(16, offset, true)

  const total =
    locals.reduce((sum, l) => sum + l.length, 0) + directorySize + eocd.length
  const out = new Uint8Array(total)
  let at = 0
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, at)
    at += part.length
  }
  return out
}
