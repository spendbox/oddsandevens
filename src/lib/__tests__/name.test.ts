import assert from 'node:assert/strict'
import { test } from 'node:test'
import { greeting, nameFromEmail } from '../name.ts'

test('a first name out of an ordinary address', () => {
  assert.equal(nameFromEmail('ada@example.com'), 'Ada')
  assert.equal(nameFromEmail('ada.lovelace@example.com'), 'Ada')
  assert.equal(nameFromEmail('ada_lovelace@example.com'), 'Ada')
  assert.equal(nameFromEmail('ada-lovelace@example.com'), 'Ada')
  assert.equal(nameFromEmail('ada+notes@example.com'), 'Ada')
  assert.equal(nameFromEmail('  ADA@Example.COM '), 'Ada')
})

test('an account number is not part of a name', () => {
  assert.equal(nameFromEmail('ada99@example.com'), 'Ada')
})

test('an address that is not a name gets no name rather than a bad one', () => {
  // "Hi, A" and "Hi, X1y2" are worse than "Hi there".
  assert.equal(nameFromEmail('a.l.99@example.com'), '')
  assert.equal(nameFromEmail('99@example.com'), '')
  assert.equal(nameFromEmail('x1y2@example.com'), '')
  assert.equal(nameFromEmail(''), '')
  assert.equal(nameFromEmail('@example.com'), '')
})

test('the greeting is never addressed to nobody', () => {
  assert.equal(greeting('Ada'), 'Hi, Ada')
  assert.equal(greeting('  '), 'Hi there')
  assert.equal(greeting(''), 'Hi there')
})
