'use client'

import { useState, useTransition } from 'react'
import { ErrorNote } from '@/components/ui'
import { saveSpec } from './actions'

/**
 * One editor for every engine.
 *
 * The editor is driven by the shape of the spec itself rather than by six
 * hand-written forms — an object becomes a group of fields, an array of objects
 * becomes a list you can add to and remove from, and a string becomes a box.
 * A new engine gets an editor for free, and there is one place to fix when the
 * editing experience needs to improve.
 *
 * Nothing here decides what is valid. Saving sends the whole spec to the server,
 * which parses it against the engine's schema and refuses it if it no longer
 * runs.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

const LONG_KEYS = new Set([
  'instructions',
  'knowledge',
  'template',
  'body',
  'description',
  'intro',
  'note',
  'greeting',
  'help',
])

function labelFor(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/^\w/, (character) => character.toUpperCase())
}

function isPlainObject(value: Json): value is { [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A blank copy of an existing item, so "add another" starts empty, not duplicated. */
function blankLike(sample: Json): Json {
  if (Array.isArray(sample)) return []
  if (isPlainObject(sample)) {
    return Object.fromEntries(Object.entries(sample).map(([key, value]) => [key, blankLike(value)]))
  }
  if (typeof sample === 'number') return 0
  if (typeof sample === 'boolean') return false
  return ''
}

function setAt(root: Json, path: (string | number)[], value: Json): Json {
  if (path.length === 0) return value
  const [head, ...rest] = path

  if (typeof head === 'number' && Array.isArray(root)) {
    const copy = [...root]
    copy[head] = setAt(copy[head], rest, value)
    return copy
  }
  if (typeof head === 'string' && isPlainObject(root)) {
    return { ...root, [head]: setAt(root[head], rest, value) }
  }
  return root
}

function removeAt(root: Json, path: (string | number)[], index: number): Json {
  const target = path.reduce<Json>(
    (node, key) =>
      typeof key === 'number' && Array.isArray(node)
        ? node[key]
        : isPlainObject(node)
          ? node[key as string]
          : node,
    root,
  )
  if (!Array.isArray(target)) return root
  return setAt(
    root,
    path,
    target.filter((_, position) => position !== index),
  )
}

function Node({
  value,
  path,
  fieldKey,
  onChange,
}: {
  value: Json
  path: (string | number)[]
  fieldKey: string
  onChange: (path: (string | number)[], value: Json) => void
}) {
  const id = `spec-${path.join('-')}`

  if (typeof value === 'boolean') {
    return (
      <label className="flex cursor-pointer items-center gap-2.5 py-1">
        <input
          type="checkbox"
          checked={value}
          onChange={(event) => onChange(path, event.target.checked)}
          className="h-4 w-4 accent-[#5b53e8]"
        />
        <span className="text-[13px] text-ink-soft">{labelFor(fieldKey)}</span>
      </label>
    )
  }

  if (typeof value === 'number') {
    return (
      <div>
        <label htmlFor={id} className="label">
          {labelFor(fieldKey)}
        </label>
        <input
          id={id}
          type="number"
          value={value}
          onChange={(event) => onChange(path, Number(event.target.value))}
          className="field"
        />
      </div>
    )
  }

  if (typeof value === 'string') {
    const long = LONG_KEYS.has(fieldKey) || value.length > 90 || value.includes('\n')
    return (
      <div>
        <label htmlFor={id} className="label">
          {labelFor(fieldKey)}
        </label>
        {long ? (
          <textarea
            id={id}
            rows={fieldKey === 'template' || fieldKey === 'knowledge' ? 10 : 3}
            value={value}
            onChange={(event) => onChange(path, event.target.value)}
            className={`field resize-y ${fieldKey === 'template' ? 'font-mono text-[12px]' : ''}`}
          />
        ) : (
          <input
            id={id}
            value={value}
            onChange={(event) => onChange(path, event.target.value)}
            className={`field ${fieldKey === 'formula' ? 'font-mono text-[13px]' : ''}`}
          />
        )}
      </div>
    )
  }

  if (Array.isArray(value)) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="label mb-0">{labelFor(fieldKey)}</span>
          <span className="text-[11px] text-ink-faint">{value.length}</span>
        </div>

        <div className="space-y-2.5">
          {value.map((item, index) => (
            <div
              key={index}
              className={
                isPlainObject(item)
                  ? 'rounded-[10px] border border-line bg-mist/40 p-3'
                  : 'flex items-center gap-2'
              }
            >
              {isPlainObject(item) ? (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] text-ink-faint">
                      {labelFor(fieldKey).replace(/s$/, '')} {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => onChange([...path, '__remove__'], index)}
                      className="text-[11px] text-ink-faint hover:text-rose"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    {Object.entries(item).map(([childKey, childValue]) => (
                      <Node
                        key={childKey}
                        value={childValue}
                        fieldKey={childKey}
                        path={[...path, index, childKey]}
                        onChange={onChange}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <input
                    value={String(item)}
                    onChange={(event) => onChange([...path, index], event.target.value)}
                    className="field"
                    aria-label={`${labelFor(fieldKey)} ${index + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => onChange([...path, '__remove__'], index)}
                    aria-label={`Remove ${labelFor(fieldKey)} ${index + 1}`}
                    className="shrink-0 px-1 text-ink-faint hover:text-rose"
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        {value.length < 40 ? (
          <button
            type="button"
            onClick={() =>
              onChange([...path, '__add__'], value.length > 0 ? blankLike(value[0]) : '')
            }
            className="mt-2.5 text-[12px] font-medium text-accent hover:text-accent-hover"
          >
            + Add {labelFor(fieldKey).toLowerCase().replace(/s$/, '')}
          </button>
        ) : null}
      </div>
    )
  }

  if (isPlainObject(value)) {
    return (
      <div className="space-y-3">
        {Object.entries(value).map(([childKey, childValue]) => (
          <Node
            key={childKey}
            value={childValue}
            fieldKey={childKey}
            path={[...path, childKey]}
            onChange={onChange}
          />
        ))}
      </div>
    )
  }

  return null
}

export function SpecEditor({ toolId, spec }: { toolId: string; spec: unknown }) {
  const [draft, setDraft] = useState<Json>(spec as Json)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const change = (path: (string | number)[], value: Json) => {
    setDirty(true)
    setSaved(false)

    const last = path[path.length - 1]
    if (last === '__remove__') {
      setDraft((current) => removeAt(current, path.slice(0, -1), value as number))
      return
    }
    if (last === '__add__') {
      const parentPath = path.slice(0, -1)
      setDraft((current) => {
        const target = parentPath.reduce<Json>(
          (node, key) =>
            typeof key === 'number' && Array.isArray(node)
              ? node[key]
              : isPlainObject(node)
                ? node[key as string]
                : node,
          current,
        )
        if (!Array.isArray(target)) return current
        return setAt(current, parentPath, [...target, value])
      })
      return
    }

    setDraft((current) => setAt(current, path, value))
  }

  if (!isPlainObject(draft)) return null

  return (
    <div className="space-y-4">
      <Node value={draft} path={[]} fieldKey="spec" onChange={change} />

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="sticky bottom-0 flex items-center gap-3 border-t border-line bg-white py-3">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const result = await saveSpec(toolId, draft)
              if (result.error) setError(result.error)
              else {
                setDirty(false)
                setSaved(true)
              }
            })
          }
          className="btn btn-primary"
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        {saved && !dirty ? <span className="text-[12px] text-lift">Saved</span> : null}
        {dirty && !pending ? <span className="text-[12px] text-ink-faint">Unsaved changes</span> : null}
      </div>
    </div>
  )
}
