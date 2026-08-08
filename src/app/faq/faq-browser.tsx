"use client";

// The FAQ, searchable.
//
// Everything the rest of the product refuses to say at length is here, which
// means it is long, which means the search box is not decoration — it is the
// primary way in. Someone arriving with a question types four words and gets
// their answer; someone browsing gets the topics.
//
// Matching is deliberately dumb: every word you type has to appear somewhere
// in the question, the answer or the topic. No fuzzy matching, no ranking, no
// index. On a list this size that is instant and, more usefully, predictable —
// you can always see why something matched, because the words are on screen.

import { useMemo, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { Boxy } from "@/components/art/boxy";
import { FAQ_TOPICS, type FaqItem, type FaqTopic } from "@/lib/faq";
import { plural } from "@/lib/plural";

/**
 * `items` is handed in rather than imported: two of the answers print what a
 * box costs to put up, an admin sets that, and this is a browser bundle. The
 * page loads the ladder and builds the list on the server.
 */
export function FaqBrowser({ items }: { items: FaqItem[] }) {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<FaqTopic | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((item) => {
      if (topic && item.topic !== topic) return false;
      if (words.length === 0) return true;
      const hay = `${item.topic} ${item.question} ${item.answer.join(" ")}`.toLowerCase();
      return words.every((word) => hay.includes(word));
    });
  }, [items, query, topic]);

  // Grouped for display, in the canonical topic order rather than whatever
  // order the answers happen to be written in.
  const grouped = useMemo(() => {
    const map = new Map<FaqTopic, FaqItem[]>();
    for (const item of results) {
      const list = map.get(item.topic) ?? [];
      list.push(item);
      map.set(item.topic, list);
    }
    return FAQ_TOPICS.filter((t) => map.has(t)).map((t) => ({
      topic: t,
      items: map.get(t)!,
    }));
  }, [results]);

  const searching = query.trim().length > 0;

  return (
    <div className="space-y-6">
      {/* Search */}
      {/* Sits below the site header, which is sticky at z-30 — otherwise it
          slides underneath it on the way down. */}
      <div className="panel sticky top-[4.25rem] z-20 rounded-2xl p-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search — try “lives”, “refund”, “case”…"
            aria-label="Search the FAQ"
            className="w-full rounded-xl bg-black/25 py-3.5 pl-11 pr-11 font-medium text-foreground outline-none transition placeholder:text-zinc-500 focus:bg-black/35"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 transition hover:text-zinc-200"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Topics */}
      <div className="flex flex-wrap gap-2">
        <Chip active={topic === null} onClick={() => setTopic(null)}>
          Everything
        </Chip>
        {FAQ_TOPICS.map((t) => (
          <Chip key={t} active={topic === t} onClick={() => setTopic(topic === t ? null : t)}>
            {t}
          </Chip>
        ))}
      </div>

      {results.length === 0 ? (
        <div className="panel rounded-3xl px-6 py-10 text-center">
          <Boxy mood="dizzy" className="mx-auto size-24" />
          <p className="mt-1 font-black tracking-tight">Nothing matches that.</p>
          <p className="mt-1 text-sm text-zinc-500">
            Try fewer words, or{" "}
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setTopic(null);
              }}
              className="text-brass underline"
            >
              start again
            </button>
            .
          </p>
        </div>
      ) : (
        <>
          {searching && (
            <p className="text-sm text-zinc-500">
              {plural(results.length, "answer")} for “{query.trim()}”
            </p>
          )}

          <div className="space-y-8">
            {grouped.map(({ topic: name, items }) => (
              <section key={name} className="space-y-2">
                <h2 className="text-sm font-black uppercase tracking-widest text-brass">
                  {name}
                </h2>
                {items.map((item) => (
                  <Answer
                    key={item.question}
                    item={item}
                    // Searching opens everything: if you typed a word, the
                    // sentence containing it should be on screen without a
                    // second click.
                    open={searching || open === item.question}
                    onToggle={() =>
                      setOpen(open === item.question ? null : item.question)
                    }
                  />
                ))}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        "rounded-xl px-3.5 py-2 text-sm font-bold transition " +
        (active
          ? "bg-brass text-ink shadow-[inset_0_1.5px_0_rgba(255,255,255,0.45),0_3px_0_var(--brass-deep)]"
          : "border-2 border-white/12 bg-white/6 text-zinc-300 hover:border-brass/50 hover:bg-white/10")
      }
    >
      {children}
    </button>
  );
}

function Answer({
  item,
  open,
  onToggle,
}: {
  item: FaqItem;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="panel panel-lift overflow-hidden rounded-2xl">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="min-w-0 flex-1 font-bold">
          {item.question}
        </span>
        <ChevronDown
          className={
            "size-4 shrink-0 text-zinc-500 transition " + (open ? "rotate-180" : "")
          }
          aria-hidden
        />
      </button>
      {open && (
        <div className="animate-fade-up space-y-3 px-5 pb-5 text-sm leading-relaxed text-zinc-400">
          {item.answer.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      )}
    </div>
  );
}
