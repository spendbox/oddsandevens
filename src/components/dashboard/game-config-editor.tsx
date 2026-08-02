"use client";

// Renders a game's setup form straight from its `fields` schema in the
// catalogue. Every game type gets a working editor for free — including the
// nested ones (a quiz's questions, each with its own list of answers).

import { useState } from "react";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import type { ConfigField } from "@/lib/games/catalog";
import { EMOJI_GROUPS, parseEmojiSet } from "@/lib/games/emoji";
import type { GameConfig } from "@/lib/games/types";

/**
 * The emoji picker. One shared component for both field types: `emoji` picks
 * exactly one, `emoji-set` picks up to `maxPicks`. Nothing is typed, so the
 * value can only ever be an emoji the players' devices can render.
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
  const picked = multiple
    ? parseEmojiSet(value)
    : value.trim().length > 0
      ? [value.trim()]
      : [];

  const toggle = (emoji: string) => {
    if (!multiple) {
      onChange(emoji);
      setOpen(false);
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

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="input-field flex items-center justify-between gap-2 text-left"
      >
        <span className="flex flex-wrap items-center gap-1 text-xl leading-none">
          {picked.length > 0 ? (
            picked.map((e) => <span key={e}>{e}</span>)
          ) : (
            <span className="text-sm text-zinc-400">Choose{multiple ? " a few" : ""}…</span>
          )}
        </span>
        <ChevronDown
          className={"size-4 shrink-0 text-zinc-400 transition " + (open ? "rotate-180" : "")}
          aria-hidden
        />
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm">
          <div className="flex flex-wrap gap-1 border-b border-zinc-100 pb-2">
            {EMOJI_GROUPS.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => setGroup(g.key)}
                className={
                  "rounded-lg px-2 py-1 text-xs font-medium transition " +
                  (group === g.key
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-500 hover:bg-zinc-100")
                }
              >
                {g.label}
              </button>
            ))}
          </div>

          <div className="mt-2 grid max-h-48 grid-cols-8 gap-1 overflow-y-auto sm:grid-cols-10">
            {active.emoji.map((emoji) => {
              const isPicked = picked.includes(emoji);
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => toggle(emoji)}
                  aria-pressed={isPicked}
                  className={
                    "relative flex aspect-square items-center justify-center rounded-lg text-xl transition hover:bg-zinc-100 " +
                    (isPicked ? "bg-[var(--brand)]/10 ring-2 ring-[var(--brand)]" : "")
                  }
                >
                  {emoji}
                  {isPicked && (
                    <Check
                      className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-[var(--brand)] p-px text-white"
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
          </div>

          {multiple && (
            <p className="mt-2 text-xs text-zinc-500">
              {picked.length} of {maxPicks} chosen — picking another swaps the
              oldest out.
            </p>
          )}
        </div>
      )}
    </div>
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
