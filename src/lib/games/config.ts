// Server-side sanitising of a game's authored config.
//
// The builder posts arbitrary JSON, so nothing from the request is trusted:
// every value is walked against the game's declared `fields` schema and
// anything unknown, oversized, or of the wrong type is dropped. What reaches
// the `games.config` jsonb column is therefore always a shape the matching
// player component knows how to read.

import type { ConfigField, GameDefinition } from "./catalog";
import type { GameConfig, GameTheme } from "./types";

// Hard ceilings so a config can never become a storage or payload problem.
const MAX_LIST_ITEMS = 60;
const MAX_TEXT = 2000;
const MAX_CONFIG_BYTES = 64 * 1024;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sanitizeScalar(field: ConfigField, value: unknown): unknown {
  switch (field.type) {
    case "toggle":
      return typeof value === "boolean" ? value : value === "true";
    case "number": {
      const n = typeof value === "string" ? Number(value) : value;
      if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
      const clamped = Math.min(
        Math.max(n, field.min ?? Number.NEGATIVE_INFINITY),
        field.max ?? Number.POSITIVE_INFINITY
      );
      return field.step && field.step < 1 ? clamped : Math.round(clamped);
    }
    case "select": {
      const s = String(value ?? "");
      const allowed = (field.options ?? []).map((o) => o.value);
      return allowed.includes(s) ? s : (allowed[0] ?? undefined);
    }
    case "image": {
      const s = String(value ?? "").trim();
      if (s.length === 0) return "";
      // Only absolute http(s) URLs — no data: or javascript: payloads.
      return /^https?:\/\/[^\s]{3,600}$/i.test(s) ? s : "";
    }
    case "text":
    case "textarea":
    default: {
      const s = String(value ?? "");
      return s.slice(0, Math.min(field.maxLength ?? MAX_TEXT, MAX_TEXT));
    }
  }
}

function sanitizeField(field: ConfigField, value: unknown): unknown {
  if (field.type !== "list") return sanitizeScalar(field, value);

  if (!Array.isArray(value)) return [];
  const max = Math.min(field.maxItems ?? MAX_LIST_ITEMS, MAX_LIST_ITEMS);
  const items = value.slice(0, max);

  // A list without sub-fields is a list of plain strings (e.g. quiz options).
  if (!field.fields || field.fields.length === 0) {
    return items.map((item) => String(item ?? "").slice(0, MAX_TEXT));
  }

  return items.map((item) => {
    const record = asRecord(item) ?? {};
    const out: Record<string, unknown> = {};
    for (const sub of field.fields!) {
      const cleaned = sanitizeField(sub, record[sub.key]);
      if (cleaned !== undefined) out[sub.key] = cleaned;
    }
    return out;
  });
}

/**
 * Rebuilds a config from the game's schema: known keys only, defaults for
 * anything the builder left out. Returns null if the result is implausibly
 * large (a sign the caller is not the builder).
 */
export function sanitizeConfig(
  def: GameDefinition,
  raw: unknown
): GameConfig | null {
  const input = asRecord(raw) ?? {};
  const out: GameConfig = { ...def.defaultConfig };

  for (const field of def.fields) {
    if (!(field.key in input)) continue;
    const cleaned = sanitizeField(field, input[field.key]);
    if (cleaned !== undefined) out[field.key] = cleaned;
  }

  if (JSON.stringify(out).length > MAX_CONFIG_BYTES) return null;
  return out;
}

export function sanitizeTheme(raw: unknown): GameTheme {
  const input = asRecord(raw) ?? {};
  const theme: GameTheme = {};
  const accent = String(input.accent ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(accent)) theme.accent = accent.toLowerCase();
  const hero = String(input.heroUrl ?? "").trim();
  if (/^https?:\/\/[^\s]{3,600}$/i.test(hero)) theme.heroUrl = hero;
  return theme;
}
