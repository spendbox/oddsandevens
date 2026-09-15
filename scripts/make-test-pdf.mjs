/**
 * Builds a minimal but genuinely valid PDF, used as a fixture by the e2e run.
 *
 * Generated rather than committed as a binary: a checked-in PDF is a blob
 * nobody can review in a diff, and the text it contains is exactly what the
 * import test asserts on, so the two should live in one file.
 */
export function makeTestPdf(lines = ['Hello from a PDF', 'This is body text that should become editable.']) {
  const encoder = new TextEncoder()

  // Escape the characters that mean something inside a PDF string literal.
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

  let y = 700
  const drawn = lines
    .map((line, i) => {
      const size = i === 0 ? 24 : 12
      const text = `BT /F1 ${size} Tf 72 ${y} Td (${esc(line)}) Tj ET`
      y -= i === 0 ? 40 : 20
      return text
    })
    .join('\n')

  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${encoder.encode(drawn).length}>>\nstream\n${drawn}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ]

  let pdf = '%PDF-1.4\n'
  // The cross-reference table records a byte offset per object, so the file
  // has to be assembled and measured as it goes.
  const offsets = [0]
  for (let i = 0; i < objects.length; i++) {
    offsets.push(encoder.encode(pdf).length)
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
  }

  const xrefAt = encoder.encode(pdf).length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefAt}\n%%EOF\n`

  return encoder.encode(pdf)
}
