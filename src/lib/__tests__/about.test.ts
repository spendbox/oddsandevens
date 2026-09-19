import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ABOUT_APP, FEATURES } from '../about.ts'
import { APP_NAME } from '../app.ts'

/**
 * The test that keeps the app's description of itself true.
 *
 * `ABOUT_APP` is what Brainstorm is told this app is, and the work people
 * bring it is often the app itself. A description that has fallen a
 * release behind does not produce a worse answer — it produces a confident
 * answer about a screen that no longer exists, which is the failure this
 * whole feature is written against.
 *
 * So: a feature without a sentence here is a failing test, and the fix is
 * one line of prose in the same change that added the feature.
 */

test('every part of the app is described', () => {
  const said = ABOUT_APP.toLowerCase()
  for (const feature of FEATURES) {
    assert.ok(said.includes(feature), `nothing in ABOUT_APP mentions "${feature}"`)
  }
})

test('it calls the app by its name', () => {
  assert.ok(ABOUT_APP.startsWith(APP_NAME))
})

test('it says what the app deliberately has not', () => {
  // Half the value of this is stopping a model recommending folders, tags
  // and a sidebar to somebody using an app that has refused all three.
  const said = ABOUT_APP.toLowerCase()
  for (const absent of ['no folders', 'no tags', 'no sidebar']) {
    assert.ok(said.includes(absent), `ABOUT_APP does not rule out ${absent}`)
  }
})

test('it is short enough to send with every question', () => {
  // One prompt carries this, the passages of somebody's notes and their
  // answers. A page is plenty; three pages would start crowding out the
  // notes, which are the part that makes the answer theirs.
  assert.ok(ABOUT_APP.length < 5_000, `ABOUT_APP is ${ABOUT_APP.length} characters`)
})
