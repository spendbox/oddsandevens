import Link from "next/link";
import { PlayerProvider } from "@/components/player/player-context";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

// The shell both legal pages share.
//
// They are prose, and prose on a dark page needs a measure and a rhythm or
// nobody reads past the first heading. One column, generous line height,
// headings that are obviously headings, and nothing else on screen.

export interface LegalSection {
  heading: string;
  paragraphs: (string | string[])[];
}

export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  /** ISO date. Rendered long-form; a legal page with no date is worthless. */
  updated: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <PlayerProvider>
      <SiteHeader />
      <main className="flex-1">
        <article className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
          <header className="animate-fade-up">
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{title}</h1>
            <p className="mt-2 text-sm text-zinc-500">
              Last updated{" "}
              {new Date(updated).toLocaleDateString("en-NG", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
            <p className="mt-4 leading-relaxed text-zinc-300">{intro}</p>
          </header>

          <nav className="panel mt-8 rounded-2xl p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              On this page
            </p>
            <ol className="mt-3 space-y-1.5 text-sm">
              {sections.map((section, i) => (
                <li key={section.heading}>
                  <a
                    href={`#${slug(section.heading)}`}
                    className="text-zinc-400 transition hover:text-brass"
                  >
                    <span className="mr-2 font-mono text-xs text-zinc-600">{i + 1}</span>
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-10 space-y-10">
            {sections.map((section, i) => (
              <section
                key={section.heading}
                id={slug(section.heading)}
                className="scroll-mt-6"
              >
                <h2 className="flex items-baseline gap-3 text-lg font-bold tracking-tight">
                  <span className="font-mono text-sm text-brass">{i + 1}</span>
                  {section.heading}
                </h2>
                <div className="mt-3 space-y-3 leading-relaxed text-zinc-400">
                  {section.paragraphs.map((paragraph, j) =>
                    Array.isArray(paragraph) ? (
                      <ul key={j} className="space-y-1.5 pl-1">
                        {paragraph.map((line, k) => (
                          <li key={k} className="flex gap-2.5">
                            <span className="mt-2 size-1 shrink-0 rounded-full bg-brass" aria-hidden />
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p key={j}>{paragraph}</p>
                    )
                  )}
                </div>
              </section>
            ))}
          </div>

          <p className="mt-12 border-t border-white/5 pt-6 text-sm text-zinc-500">
            Most day-to-day questions are answered in plainer language on the{" "}
            <Link href="/faq" className="text-brass underline">
              questions page
            </Link>
            .
          </p>
        </article>
      </main>
      <SiteFooter />
    </PlayerProvider>
  );
}

function slug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
