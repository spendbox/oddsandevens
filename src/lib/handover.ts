'use client'

import { forgetDismissed } from './dismissed.ts'
import { forgetName } from './profile.ts'
import { forgetSeen } from './team-unread.ts'
import { clearAll, loadMeta, saveMeta } from './store.ts'
import { pushAll } from './sync.ts'

/**
 * Whose device this is, and what happens when that changes.
 *
 * ## The bug this exists for
 *
 * IndexedDB is the store, not a cache, and it knew nothing about accounts.
 * So signing out left every note sitting there, and signing in as somebody
 * else showed them — and then, because signing in pushes what is on the
 * device up to the account that just arrived, *uploaded* them. One person's
 * notes in another person's account, from two taps, with no warning.
 *
 * It is worse than it looks, because the sync cursors have the same problem
 * from the other direction: a cursor is "the newest row this device has
 * accepted", and one left over from the previous account would make the new
 * account's first pull skip every note older than it.
 *
 * ## The rule
 *
 * The device belongs to whoever last signed in, and it remembers that beside
 * the notes themselves. A different account arriving means the device is
 * wiped first and filled from the server afterwards. Nothing is merged,
 * because there is no honest way to merge two people's notes.
 *
 * ## Why signing in with no owner is different
 *
 * A device that has never been signed into is somebody's own notes written
 * before they had an account, and adopting those is the point of being able
 * to write without one. That case keeps everything and pushes it up, exactly
 * as it always did. The distinction is the whole of `handOverTo` below.
 */

/** Where the owner is remembered: beside the notes, in the same database. */
const OWNER = 'owner'

export async function deviceOwner(): Promise<string | null> {
  // Empty is nobody, not somebody with no name: signing out writes an empty
  // string rather than deleting the key, so that "this device has been
  // handed back" is a fact on the record rather than an absence.
  const owner = await loadMeta<string>(OWNER)
  return owner || null
}

export async function claimDevice(userId: string | null): Promise<void> {
  await saveMeta(OWNER, userId ?? '')
}

/**
 * Forgets the notes, the sync cursors and anything that names a person.
 *
 * The theme and the page width stay: they are about this screen, and a
 * browser that goes back to light mode because somebody signed in is a
 * browser doing something nobody asked for. A name somebody typed and the
 * suggestions they turned down are about *them* — and the first of those is
 * printed across the top of the screen, which is exactly the complaint this
 * is fixing.
 *
 * Both go through their own stores rather than by removing the key, because
 * these are read through `useSyncExternalStore` and a key removed behind its
 * back leaves the old value on screen until something else happens to
 * re-render.
 */
export async function wipeDevice(): Promise<void> {
  await clearAll()
  forgetName()
  forgetDismissed()
  // Which team chats had been read is a fact about the last person here.
  forgetSeen()
}

/** What happened when an account signed in, so the caller can say so. */
export type HandOver =
  /** A device that had never been signed into: its notes are now theirs. */
  | 'adopted'
  /** The same person as last time: nothing was touched. */
  | 'same'
  /** Somebody else: the device was emptied and will fill from the server. */
  | 'fresh'

/**
 * Hands the device to whoever has just signed in.
 *
 * Called before the first sync, because the whole point is that nothing of
 * the previous account's is on screen, in the database or in the outbox by
 * the time the new account's first pull lands.
 */
export async function handOverTo(userId: string): Promise<HandOver> {
  const owner = await deviceOwner()
  if (!owner) {
    await claimDevice(userId)
    return 'adopted'
  }
  if (owner === userId) return 'same'
  await wipeDevice()
  await claimDevice(userId)
  return 'fresh'
}

/** What signing out did, which decides what the menu says afterwards. */
export interface Departure {
  /** Whether the device was emptied. False means something is still owed. */
  cleared: boolean
}

/**
 * Signing out, and taking the notes off the device with it.
 *
 * Everything is pushed first and the device is only emptied if all of it
 * arrived. That order is the entire safety of this: a failed push means
 * notes that exist nowhere else, and clearing them because somebody pressed
 * "Sign out" on a train would be the worst thing this app could do.
 *
 * So a sign-out with nothing owed is clean — the next person to open this
 * browser sees an empty app — and a sign-out that could not reach the server
 * keeps the notes and says so. The other account's sign-in wipes them
 * anyway, so nothing of theirs is ever shown to anybody else either way.
 */
export async function leaveDevice(
  userId: string,
  /*
    The push, passed in so both halves of this — everything arrived, and
    something is still owed — are unit tests rather than something to find
    out by pulling a network cable at the wrong moment.
  */
  push: (userId: string) => Promise<boolean> = pushAll,
): Promise<Departure> {
  const pushed = await push(userId)
  if (!pushed) return { cleared: false }
  await wipeDevice()
  await claimDevice(null)
  return { cleared: true }
}
