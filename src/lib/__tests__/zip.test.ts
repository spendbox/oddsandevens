import assert from 'node:assert/strict'
import { test } from 'node:test'
import { crc32, readZip, writeZip, zipSupported } from '../zip.ts'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

test('the platform provides the compression this needs', () => {
  assert.equal(zipSupported(), true)
})

test('CRC-32 matches the known values every zip reader checks against', () => {
  assert.equal(crc32(encoder.encode('')), 0)
  assert.equal(crc32(encoder.encode('123456789')), 0xcbf43926)
  assert.equal(crc32(encoder.encode('The quick brown fox jumps over the lazy dog')), 0x414fa339)
})

test('an archive round-trips', async () => {
  const files = new Map([
    ['a.txt', encoder.encode('hello')],
    ['nested/b.xml', encoder.encode('<x>yes</x>')],
  ])
  const back = await readZip(await writeZip(files))
  assert.deepEqual([...back.keys()].sort(), ['a.txt', 'nested/b.xml'])
  assert.equal(decoder.decode(back.get('a.txt')), 'hello')
  assert.equal(decoder.decode(back.get('nested/b.xml')), '<x>yes</x>')
})

test('content that compresses well survives', async () => {
  const repetitive = encoder.encode('the same sentence over and over. '.repeat(500))
  const written = await writeZip(new Map([['big.txt', repetitive]]))
  assert.ok(written.length < repetitive.length / 2, 'should actually be compressed')
  const back = await readZip(written)
  assert.deepEqual(back.get('big.txt'), repetitive)
})

test('tiny content that deflate would enlarge is stored instead', async () => {
  const tiny = encoder.encode('x')
  const back = await readZip(await writeZip(new Map([['t.txt', tiny]])))
  assert.deepEqual(back.get('t.txt'), tiny)
})

test('binary content is byte-exact', async () => {
  const bytes = new Uint8Array(1024)
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) % 256
  const back = await readZip(await writeZip(new Map([['blob.bin', bytes]])))
  assert.deepEqual(back.get('blob.bin'), bytes)
})

test('an empty entry round-trips', async () => {
  const back = await readZip(await writeZip(new Map([['empty.txt', new Uint8Array(0)]])))
  assert.equal(back.get('empty.txt')?.length, 0)
})

test('unicode names and content survive', async () => {
  const files = new Map([['dossier/résumé.txt', encoder.encode('naïve café — 日本語')]])
  const back = await readZip(await writeZip(files))
  assert.equal(decoder.decode(back.get('dossier/résumé.txt')), 'naïve café — 日本語')
})

test('rubbish is reported, not misread', async () => {
  await assert.rejects(() => readZip(encoder.encode('this is not a zip file at all')), /not a zip/)
})

test('many entries keep their order and content', async () => {
  const files = new Map(
    Array.from({ length: 40 }, (_, i) => [`file-${i}.txt`, encoder.encode(`content ${i}`)] as const),
  )
  const back = await readZip(await writeZip(files))
  assert.equal(back.size, 40)
  assert.equal(decoder.decode(back.get('file-39.txt')), 'content 39')
})
