// "jane.doe@gmail.com" -> "ja***@g***.com" — enough to feel real, never
// enough to identify. Degenerate addresses fall back to full masking.
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  const lead = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s.slice(0, 1));
  return `${lead(local, 2)}***@${lead(host, 1)}***${tld}`;
}
