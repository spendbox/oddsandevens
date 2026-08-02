// Public leaderboards show who is winning without showing who they are.
//
// Around 70% of the address is starred out, and the runs of stars are a fixed
// width rather than the real length — so the mask leaks neither the characters
// nor how many there were. Every row on a board ends up the same shape, which
// also happens to look tidier than ragged ones.
//
// What survives: the first character or two of the local part, and the TLD.
// That's enough for a player to recognise their own row at a glance (and the
// board marks their row explicitly anyway) and not enough for anyone else to
// work the address out.

const LOCAL_STARS = 8;
const HOST_STARS = 8;

/** "jackofot@gmail.com" -> "ja********@********.com" */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) {
    // Not an address we can split: keep the first character, hide the rest.
    return email.slice(0, 1) + "*".repeat(LOCAL_STARS);
  }

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const tld = dot > 0 ? domain.slice(dot) : "";

  // A quarter of the local part, never more than two characters.
  const keep = Math.min(Math.max(Math.floor(local.length * 0.25), 1), 2);

  return `${local.slice(0, keep)}${"*".repeat(LOCAL_STARS)}@${"*".repeat(
    HOST_STARS
  )}${tld}`;
}
