/**
 * "1 hunter", "2 hunters", "0 hunters".
 *
 * Trivial, and worth having in one place: the same count was being written out
 * by hand in half a dozen components and one of them rendered "1 hunters".
 */
export function plural(count: number, singular: string, pluralForm?: string): string {
  const word = count === 1 ? singular : (pluralForm ?? `${singular}s`);
  return `${count.toLocaleString("en-NG")} ${word}`;
}
