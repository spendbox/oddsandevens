import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { fileNameFor, pickMimeType } from '../recorder.ts'
import { transcribeAll } from '../transcribe.ts'

/*
  MediaRecorder and the microphone cannot be unit tested, and a test that
  needs somebody to speak into a laptop is not a test. What can be tested is
  everything that decides what happens to the audio once it exists: which
  container this browser is asked for, what the file is called — which is how
  the far end works out how to decode it — and what a recording becomes when
  some of it does not arrive.
*/

test('the best container this browser will take, best first', () => {
  const chrome = (type: string) => type.startsWith('audio/webm')
  assert.equal(pickMimeType(chrome), 'audio/webm;codecs=opus')

  // Safari records MP4 and nothing else, which is that or no audio at all.
  const safari = (type: string) => type === 'audio/mp4'
  assert.equal(pickMimeType(safari), 'audio/mp4')

  // Opus in an Ogg container rather than a WebM one.
  const ogg = (type: string) => type.includes('ogg')
  assert.equal(pickMimeType(ogg), 'audio/ogg;codecs=opus')
})

test('a browser that will take none of them is left to choose', () => {
  assert.equal(pickMimeType(() => false), '', 'empty means "you pick"')
})

test('the file is named for what is actually in it', () => {
  assert.equal(fileNameFor('audio/webm;codecs=opus'), 'part.webm')
  assert.equal(fileNameFor('audio/ogg;codecs=opus'), 'part.ogg')
  assert.equal(fileNameFor('audio/mp4'), 'part.mp4')
  // A recorder that reported no type at all still has to be called
  // something, and webm is what the browsers that do this are recording.
  assert.equal(fileNameFor(''), 'part.webm')
})

/* --------------------------------------------- a recording, piece by piece */

const piece = (name: string) => new Blob([name], { type: 'audio/webm' })
const real = globalThis.fetch

afterEach(() => {
  globalThis.fetch = real
})

/** Answers each upload in turn from a list of what the server would say. */
function server(replies: Array<{ ok: boolean; text?: string; error?: string }>) {
  let n = 0
  globalThis.fetch = (async () => {
    const reply = replies[n++] ?? { ok: false, error: 'no more' }
    return {
      ok: reply.ok,
      json: async () => ({ text: reply.text, error: reply.error }),
    } as Response
  }) as typeof fetch
}

test('the pieces come back as one transcript, in the order they were said', async () => {
  server([
    { ok: true, text: 'The first thing said.' },
    { ok: true, text: 'And the second.' },
  ])
  const result = await transcribeAll([piece('a'), piece('b')], 'en')
  assert.equal(result.text, 'The first thing said. And the second.')
  assert.equal(result.sent, 2)
  assert.equal(result.heard, 2)
  assert.equal(result.problem, undefined)
})

test('a piece that fails costs that piece and not the recording', async () => {
  server([
    { ok: true, text: 'The first thing said.' },
    { ok: false, error: 'That did not go through.' },
    { ok: true, text: 'And the third.' },
  ])
  const result = await transcribeAll([piece('a'), piece('b'), piece('c')], 'en')
  assert.equal(result.text, 'The first thing said. And the third.')
  assert.equal(result.sent, 3)
  assert.equal(result.heard, 2, 'so the caller can say part of it is missing')
  assert.match(result.problem ?? '', /did not go through/)
})

test('nothing coming back at all is an empty transcript, not a throw', async () => {
  // The caller falls back to the words the browser heard, which is the whole
  // reason this reports rather than raises.
  server([{ ok: false, error: 'The configured API key was rejected.' }])
  const result = await transcribeAll([piece('a')], 'en')
  assert.equal(result.text, '')
  assert.equal(result.heard, 0)
  assert.ok(result.problem)
})

test('a piece with nothing said in it is not counted as heard', async () => {
  server([{ ok: true, text: '   ' }, { ok: true, text: 'Only this.' }])
  const result = await transcribeAll([piece('a'), piece('b')], 'en')
  assert.equal(result.text, 'Only this.')
  assert.equal(result.heard, 1)
})

test('progress is reported for every piece, and finishes', async () => {
  server([{ ok: true, text: 'one' }, { ok: true, text: 'two' }])
  const seen: string[] = []
  await transcribeAll([piece('a'), piece('b')], 'en', (done, total) =>
    seen.push(`${done}/${total}`),
  )
  assert.deepEqual(seen, ['0/2', '1/2', '2/2'])
})
