"use client";

// Renders a game's setup form straight from its `fields` schema in the
// catalogue. Every game type gets a working editor for free — including the
// nested ones (a quiz's questions, each with its own list of answers).

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Plus, Search, Trash2, X } from "lucide-react";
import type { ConfigField } from "@/lib/games/catalog";
import { EMOJI_GROUPS, parseEmojiSet, searchEmoji } from "@/lib/games/emoji";
import type { GameConfig } from "@/lib/games/types";

/**
 * The emoji picker. One shared component for both field types: `emoji` picks
 * exactly one, `emoji-set` picks up to `maxPicks`. Nothing is typed, so the
 * value can only ever be an emoji the players' devices can render.
 *
 * It opens as a sheet rather than as a dropdown in the form. The dropdown was
 * unusable on a phone: it appeared inside an already-scrolling modal, the
 * autofocused search box threw the keyboard up over most of it, and what was
 * left was a 224px window onto a few hundred emoji. A sheet gets the full
 * height of the screen, and the keyboard only appears if someone asks for it
 * by tapping search.
 *
 * The set is a few hundred strong, which is past the point where scrolling a
 * grid works — hence search. Type "coffee" and you get ☕ without knowing it
 * lives under Drinks.
 */
function EmojiPicker({
  value,
  multiple,
  maxPicks,
  onChange,
}: {
  value: string;
  multiple: boolean;
  maxPicks: number;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(EMOJI_GROUPS[0].key);
  const [query, setQuery] = useState("");
  // Only grab focus where a keyboard is already out: on a touch screen,
  // focusing the search box covers the emoji with the thing you'd use to
  // avoid looking at them.
  const [focusSearch, setFocusSearch] = useState(false);

  const picked = multiple
    ? parseEmojiSet(value)
    : value.trim().length > 0
      ? [value.trim()]
      : [];

  // The sheet covers the screen, so the page behind it must not scroll with it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openPicker = () => {
    setFocusSearch(window.matchMedia("(pointer: fine)").matches);
    setQuery("");
    setOpen(true);
  };

  /**
   * Closes on the next tick rather than inside the click that asked for it.
   *
   * Taking the sheet out of the DOM mid-dispatch makes Chrome fire a second
   * click at whatever is now under the pointer — and often enough that is the
   * field which opens the sheet, so it shut and reopened in one tap. Leaving
   * it mounted for the rest of the dispatch costs a frame and nothing else.
   */
  const close = useCallback(() => {
    window.setTimeout(() => setOpen(false), 0);
  }, []);

  const toggle = (emoji: string) => {
    if (!multiple) {
      onChange(emoji);
      close();
      return;
    }
    const next = picked.includes(emoji)
      ? picked.filter((e) => e !== emoji)
      : picked.length >= maxPicks
        ? [...picked.slice(1), emoji]
        : [...picked, emoji];
    onChange(next.join(" "));
  };

  const active = EMOJI_GROUPS.find((g) => g.key === group) ?? EMOJI_GROUPS[0];
  const showing = query.trim().length > 0 ? searchEmoji(query) : active.emoji;

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className="input-field flex items-center justify-between gap-2 text-left"
      >
        <span className="emoji flex flex-wrap items-center gap-1.5 text-2xl leading-none">
          {picked.length > 0 ? (
            picked.map((e) => <span key={e}>{e}</span>)
          ) : (
            <span className="font-sans text-sm text-zinc-400">
              Choose{multiple ? " a few" : ""}…
            </span>
          )}
        </span>
        <ChevronDown className="size-4 shrink-0 text-zinc-400" aria-hidden />
      </button>

      {open && (
        <div
          onClick={close}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-zinc-900/50 backdrop-blur-sm sm:items-center sm:p-4"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choose an emoji"
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[88svh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:max-h-[36rem] sm:max-w-lg sm:rounded-3xl"
          >
            {/* Grab handle — the thing that says "this sheet moves". */}
            <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
              <span className="h-1 w-10 rounded-full bg-zinc-300" />
            </div>

            <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-3">
              <p className="text-sm font-semibold text-zinc-900">
                {multiple ? `Pick up to ${maxPicks}` : "Pick one"}
              </p>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="-mr-1.5 flex size-9 items-center justify-center rounded-full text-zinc-500 active:bg-zinc-100"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>

            <div className="px-4 pb-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
                  aria-hidden
                />
                <input
                  autoFocus={focusSearch}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search — coffee, trophy, fire…"
                  // 16px or bigger, or iOS zooms the whole page on focus.
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-9 pr-9 text-base outline-none focus:border-zinc-300 focus:bg-white"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 active:bg-zinc-100"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                )}
              </div>
            </div>

            {query.trim().length === 0 && (
              <div className="flex gap-1.5 overflow-x-auto px-4 pb-2">
                {EMOJI_GROUPS.map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => setGroup(g.key)}
                    className={
                      "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition " +
                      (group === g.key
                        ? "bg-zinc-900 text-white"
                        : "bg-zinc-100 text-zinc-600")
                    }
                  >
                    <span className="emoji text-base leading-none">{g.icon}</span>
                    {g.label}
                  </button>
                ))}
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
              <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
                {showing.map((option) => {
                  const isPicked = picked.includes(option.char);
                  return (
                    <button
                      key={option.char}
                      type="button"
                      onClick={() => toggle(option.char)}
                      aria-pressed={isPicked}
                      title={option.name}
                      className={
                        "emoji relative flex aspect-square items-center justify-center rounded-xl text-3xl transition active:scale-90 sm:text-2xl " +
                        (isPicked
                          ? "bg-[var(--brand)]/10 ring-2 ring-[var(--brand)]"
                          : "active:bg-zinc-100")
                      }
                    >
                      {option.char}
                      {isPicked && (
                        <Check
                          className="absolute right-0.5 top-0.5 size-3.5 rounded-full bg-[var(--brand)] p-0.5 text-white"
                          aria-hidden
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {showing.length === 0 && (
                <p className="px-1 py-8 text-center text-sm text-zinc-500">
                  Nothing matches “{query}”. Try a plainer word.
                </p>
              )}
            </div>

            {/* Sits below the safe area on a phone, so the home bar can't
                cover the button that closes the sheet. */}
            <div className="border-t border-zinc-100 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
              {multiple ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-zinc-500">
                    {picked.length} of {maxPicks} chosen
                    {picked.length >= maxPicks && " — the next swaps the oldest out"}
                  </p>
                  <button
                    type="button"
                    onClick={close}
                    className="btn-primary shrink-0 px-5 py-2 text-sm"
                    style={{ backgroundColor: "var(--brand)" }}
                  >
                    Done
                  </button>
                </div>
              ) : (
                <p className="text-center text-xs text-zinc-500">
                  Tap one to choose it.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

type Value = unknown;

function defaultFor(field: ConfigField): Value {
  switch (field.type) {
    case "list":
      return [];
    case "emoji":
    case "emoji-set":
      return "";
    case "toggle":
      return false;
    case "number":
      return field.min ?? 0;
    case "select":
      return field.options?.[0]?.value ?? "";
    default:
      return "";
  }
}

function cloneNewItem(field: ConfigField): Value {
  if (field.newItem === undefined) return "";
  return JSON.parse(JSON.stringify(field.newItem));
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: Value;
  onChange: (next: Value) => void;
}) {
  switch (field.type) {
    case "emoji":
    case "emoji-set":
      return (
        <EmojiPicker
          value={String(value ?? "")}
          multiple={field.type === "emoji-set"}
          maxPicks={field.maxPicks ?? 5}
          onChange={onChange}
        />
      );
    case "textarea":
      return (
        <textarea
          value={String(value ?? "")}
          maxLength={field.maxLength}
          rows={2}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="input-field resize-y"
        />
      );
    case "number":
      return (
        <input
          type="number"
          value={String(value ?? "")}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          className="input-field"
        />
      );
    case "toggle":
      return (
        <label className="flex cursor-pointer items-center gap-2 py-1.5">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="size-4 accent-[var(--brand)]"
          />
          <span className="text-sm text-zinc-600">{field.label}</span>
        </label>
      );
    case "select":
      return (
        <select
          value={String(value ?? field.options?.[0]?.value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="input-field"
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case "image":
      return (
        <input
          type="url"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…"
          className="input-field"
        />
      );
    default:
      return (
        <input
          type="text"
          value={String(value ?? "")}
          maxLength={field.maxLength}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="input-field"
        />
      );
  }
}

function ListEditor({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: Value;
  onChange: (next: Value) => void;
}) {
  const items = Array.isArray(value) ? (value as Value[]) : [];
  const noun = field.itemNoun ?? "item";
  const atMax = items.length >= (field.maxItems ?? 60);
  const atMin = items.length <= (field.minItems ?? 0);

  const update = (index: number, next: Value) => {
    const copy = [...items];
    copy[index] = next;
    onChange(copy);
  };

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index) => (
        <div
          key={index}
          className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {noun} {index + 1}
            </span>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              disabled={atMin}
              className="btn-ghost px-2 text-zinc-400 hover:text-rose-600 disabled:opacity-40"
              aria-label={`Remove ${noun} ${index + 1}`}
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </div>

          {/* A list without sub-fields is a list of plain strings. */}
          {!field.fields || field.fields.length === 0 ? (
            <input
              type="text"
              value={String(item ?? "")}
              onChange={(e) => update(index, e.target.value)}
              className="input-field"
            />
          ) : (
            <div className="flex flex-col gap-2">
              {field.fields.map((sub) => {
                const record = (item ?? {}) as Record<string, Value>;
                return (
                  <FieldRow
                    key={sub.key}
                    field={sub}
                    value={record[sub.key] ?? defaultFor(sub)}
                    onChange={(next) =>
                      update(index, { ...record, [sub.key]: next })
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...items, cloneNewItem(field)])}
        disabled={atMax}
        className="btn-secondary self-start text-sm disabled:opacity-50"
      >
        <Plus className="size-4" aria-hidden />
        Add {noun}
      </button>
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: Value;
  onChange: (next: Value) => void;
}) {
  if (field.type === "list") {
    return (
      <div>
        <span className="field-label">{field.label}</span>
        {field.help && (
          <p className="-mt-1 mb-2 text-xs text-zinc-500">{field.help}</p>
        )}
        <ListEditor field={field} value={value} onChange={onChange} />
      </div>
    );
  }

  // The toggle renders its own inline label.
  if (field.type === "toggle") {
    return (
      <div>
        <FieldInput field={field} value={value} onChange={onChange} />
        {field.help && <p className="text-xs text-zinc-500">{field.help}</p>}
      </div>
    );
  }

  return (
    <label className="block">
      <span className="field-label">{field.label}</span>
      <FieldInput field={field} value={value} onChange={onChange} />
      {field.help && <p className="mt-1 text-xs text-zinc-500">{field.help}</p>}
    </label>
  );
}

export function GameConfigEditor({
  fields,
  config,
  onChange,
}: {
  fields: ConfigField[];
  config: GameConfig;
  onChange: (next: GameConfig) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {fields.map((field) => (
        <FieldRow
          key={field.key}
          field={field}
          value={config[field.key] ?? defaultFor(field)}
          onChange={(next) => onChange({ ...config, [field.key]: next })}
        />
      ))}
    </div>
  );
}
