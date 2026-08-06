import Link from "next/link";
import { ReportIssueButton } from "@/components/report-issue";

// One footer, so the legal pages and the FAQ are reachable from anywhere
// rather than only from the landing page somebody arrived past.

const LINKS = [
  { href: "/faq", label: "Questions" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/dashboard", label: "Contributor dashboard" },
  { href: "/me", label: "Your lives and rewards" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-white/5 py-8">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 text-xs text-zinc-600">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="transition hover:text-brass">
            {link.label}
          </Link>
        ))}
        {/* Contact us, and the only one of these that is a form rather than a
            page. It sits with the rest so it is reachable from anywhere. */}
        <ReportIssueButton
          context="Footer"
          label="Contact us"
          className="transition hover:text-brass"
        />
      </nav>
    </footer>
  );
}
