import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeBlock } from '../blocks.ts'
import { docToDocx, docxToBlocks } from '../docx.ts'
import type { Block, Doc } from '../types.ts'
import { readZip } from '../zip.ts'

const decoder = new TextDecoder()

function doc(blocks: Block[], title = 'My document'): Doc {
  return { id: 'd', title, blocks, createdAt: 0, updatedAt: 0 }
}

function textBlock(type: 'text' | 'heading' | 'bullet' | 'quote', text: string, extra = {}) {
  const block = makeBlock(type, 1)
  Object.assign(block, { text }, extra)
  return block
}

/** The document.xml inside a generated file, for asserting on the markup. */
async function documentXml(file: Blob): Promise<string> {
  const files = await readZip(new Uint8Array(await file.arrayBuffer()))
  return decoder.decode(files.get('word/document.xml'))
}

test('a generated file has every part Word requires', async () => {
  const files = await readZip(new Uint8Array(await (await docToDocx(doc([]))).arrayBuffer()))
  for (const part of [
    '[Content_Types].xml',
    '_rels/.rels',
    'word/_rels/document.xml.rels',
    'word/document.xml',
    'word/styles.xml',
    'word/numbering.xml',
  ]) {
    assert.ok(files.has(part), `missing ${part}`)
  }
})

test('the body ends with a section break, or Word calls the file damaged', async () => {
  const xml = await documentXml(await docToDocx(doc([])))
  assert.match(xml, /<w:sectPr>[\s\S]*<\/w:sectPr><\/w:body>/)
})

test('the document title becomes the first heading', async () => {
  const xml = await documentXml(await docToDocx(doc([], 'Quarterly review')))
  assert.match(xml, /Heading1/)
  assert.match(xml, /Quarterly review/)
})

test('a document round-trips through Word and back', async () => {
  const original = doc([
    textBlock('heading', 'A section'),
    textBlock('text', 'An ordinary paragraph.'),
    textBlock('bullet', 'first point'),
    textBlock('bullet', 'second point'),
    textBlock('quote', 'Someone said this.'),
  ])
  const back = await docxToBlocks(await docToDocx(original))

  // The title becomes a heading of its own, ahead of the blocks.
  assert.equal(back[0].type, 'heading')
  assert.equal(back[0].text, 'My document')

  const rest = back.slice(1)
  assert.deepEqual(
    rest.map((b) => [b.type, b.text]),
    [
      ['heading', 'A section'],
      ['text', 'An ordinary paragraph.'],
      ['bullet', 'first point'],
      ['bullet', 'second point'],
      ['quote', 'Someone said this.'],
    ],
  )
})

test('bold and italic survive the round trip', async () => {
  const original = doc([textBlock('text', 'a bold word', { html: 'a <b>bold</b> word' })])
  const back = await docxToBlocks(await docToDocx(original))
  const paragraph = back.find((b) => b.text === 'a bold word')
  assert.ok(paragraph, 'the paragraph came back')
  assert.match(paragraph.html ?? '', /<b>bold<\/b>/)
})

test('heading levels survive', async () => {
  const original = doc([
    textBlock('heading', 'One', { level: 1 }),
    textBlock('heading', 'Two', { level: 2 }),
    textBlock('heading', 'Three', { level: 3 }),
  ])
  const back = (await docxToBlocks(await docToDocx(original))).slice(1)
  assert.deepEqual(
    back.map((b) => [b.text, b.level]),
    [
      ['One', 1],
      ['Two', 2],
      ['Three', 3],
    ],
  )
})

test('nesting depth survives on list items', async () => {
  const original = doc([
    textBlock('bullet', 'top', { indent: 0 }),
    textBlock('bullet', 'under', { indent: 1 }),
  ])
  const back = (await docxToBlocks(await docToDocx(original))).slice(1)
  assert.equal(back[0].indent, undefined)
  assert.equal(back[1].indent, 1)
})

test('a numbered list is written with the decimal numbering definition', async () => {
  const numbered = textBlock('bullet', 'first', { ordered: true })
  const xml = await documentXml(await docToDocx(doc([numbered])))
  assert.match(xml, /<w:numId w:val="2"\/>/)
})

test('characters that would break the XML are escaped', async () => {
  const original = doc([textBlock('text', 'a < b & c > d "quoted"')], 'Title & <tag>')
  const back = await docxToBlocks(await docToDocx(original))
  assert.ok(back.some((b) => b.text === 'a < b & c > d "quoted"'), JSON.stringify(back.map((b) => b.text)))
  assert.ok(back.some((b) => b.text === 'Title & <tag>'))
})

test('control characters are stripped rather than producing an unopenable file', async () => {
  const original = doc([textBlock('text', 'beforeafter')])
  const back = await docxToBlocks(await docToDocx(original))
  assert.ok(back.some((b) => b.text === 'beforeafter'), JSON.stringify(back.map((b) => b.text)))
})

test('unicode survives', async () => {
  const original = doc([textBlock('text', 'naïve café 日本語 — em dash')])
  const back = await docxToBlocks(await docToDocx(original))
  assert.ok(back.some((b) => b.text === 'naïve café 日本語 — em dash'))
})

test('every block type exports without throwing', async () => {
  const types = ['text', 'heading', 'bullet', 'quote', 'todo', 'divider'] as const
  for (const type of types) {
    const file = await docToDocx(doc([makeBlock(type)]))
    assert.ok(file.size > 0, `${type} produced nothing`)
  }
})

test('something that is not a Word document is reported, not misread', async () => {
  const notDocx = new Blob([new TextEncoder().encode('just some text')])
  await assert.rejects(() => docxToBlocks(notDocx), /zip|Word/i)
})

test('a zip that is not a Word document is reported', async () => {
  const { writeZip } = await import('../zip.ts')
  const zipped = await writeZip(new Map([['hello.txt', new TextEncoder().encode('hi')]]))
  await assert.rejects(
    () => docxToBlocks(new Blob([zipped as BlobPart])),
    /does not look like a Word document/,
  )
})

test('an empty paragraph in a Word file does not become an empty block', async () => {
  const original = doc([textBlock('text', ''), textBlock('text', 'real content')])
  const back = await docxToBlocks(await docToDocx(original))
  assert.ok(back.every((b) => b.text.trim() !== ''))
})
