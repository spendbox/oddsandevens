/**
 * Ids are made on the device, never asked for from a server. A new block has
 * to exist the instant a key is pressed — a round trip to get its name would
 * put the network in front of the cursor, which is the one place it must
 * never be.
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
