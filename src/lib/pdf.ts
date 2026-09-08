/**
 * A one-page PDF wrapping a single image.
 *
 * Written by hand rather than pulling in a PDF library, because the job is
 * narrow enough to not be worth ~300KB of JavaScript on a phone: one page, one
 * JPEG, no text, no fonts. A PDF that contains one image is five objects and a
 * cross-reference table.
 *
 * A PDF flyer matters because it is the format that survives being emailed,
 * printed and put on a noticeboard without anyone re-compressing it, and it is
 * what people ask for when they mean "a proper file".
 */

/** Turn a data URL into the raw bytes it encodes. */
function bytesFromDataUrl(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Wrap a JPEG in a PDF page of the same proportions.
 *
 * The page is sized in points (72 per inch). A 1080px square at 150dpi is
 * 518.4pt, which prints at about 18cm — a sensible flyer.
 */
export function jpegToPdf(jpegDataUrl: string, pixels: number): Blob {
  const image = bytesFromDataUrl(jpegDataUrl)
  const side = (pixels / 150) * 72

  const header = '%PDF-1.4\n'
  const objects: string[] = []

  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')
  objects.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R ' +
      `/MediaBox [0 0 ${side.toFixed(2)} ${side.toFixed(2)}] ` +
      '/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
  )

  // The image object's stream is binary, so it is spliced in as bytes below
  // rather than being part of these strings.
  const imageHeader =
    '4 0 obj\n<< /Type /XObject /Subtype /Image ' +
    `/Width ${pixels} /Height ${pixels} /ColorSpace /DeviceRGB ` +
    `/BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`
  const imageFooter = '\nendstream\nendobj\n'

  // Draw the image across the whole page.
  const content = `q\n${side.toFixed(2)} 0 0 ${side.toFixed(2)} 0 0 cm\n/Im0 Do\nQ\n`
  const contentObject = `5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`

  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let cursor = 0

  const push = (chunk: Uint8Array) => {
    parts.push(chunk)
    cursor += chunk.length
  }

  push(encoder.encode(header))

  for (const object of objects) {
    offsets.push(cursor)
    push(encoder.encode(object))
  }

  offsets.push(cursor)
  push(encoder.encode(imageHeader))
  push(image)
  push(encoder.encode(imageFooter))

  offsets.push(cursor)
  push(encoder.encode(contentObject))

  // The cross-reference table: where each object starts, to the byte.
  const xrefStart = cursor
  let xref = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    xref += `${offset.toString().padStart(10, '0')} 00000 n \n`
  }
  xref +=
    `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefStart}\n%%EOF\n`

  push(encoder.encode(xref))

  return new Blob(parts as BlobPart[], { type: 'application/pdf' })
}
