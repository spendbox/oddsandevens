"use client";

// Renders a game's setup form straight from its `fields` schema in the
// catalogue. Every game type gets a working editor for free — including the
// nested ones (a quiz's questions, each with its own list of answers).

import { Plus, Trash2 } from "lucide-react";
import type { ConfigField } from "@/lib/games/catalog";
import type { GameConfig } from "@/lib/games/types";

type Value = unknown;

function defaultFor(field: ConfigField): Value {
  switch (field.type) {
    case "list":
      return [];
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
