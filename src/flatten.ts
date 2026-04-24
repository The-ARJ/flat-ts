import type { FlattenOptions, FlattenResult } from './types.js'

/** Keys that must never appear as output keys — prototype-pollution guard. */
const BLOCKED = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Returns true for values that should be treated as opaque leaves:
 * primitives, Date, RegExp, and built-ins that don't have own enumerable
 * string keys (Map, Set, ArrayBuffer, TypedArrays, Promise, Error, etc.).
 *
 * Plain objects (prototype === Object.prototype or null) and Arrays are
 * recursed into. Instances of user classes are rejected — they cannot
 * round-trip and silently losing their identity is a footgun.
 */
function classifyValue(val: unknown):
  | { kind: 'leaf' }
  | { kind: 'plain-object' }
  | { kind: 'array' }
  | { kind: 'reject'; reason: string } {
  if (val === null || typeof val !== 'object') return { kind: 'leaf' }
  if (val instanceof Date || val instanceof RegExp) return { kind: 'leaf' }
  if (Array.isArray(val)) return { kind: 'array' }

  const proto = Object.getPrototypeOf(val)
  if (proto === Object.prototype || proto === null) return { kind: 'plain-object' }

  const ctorName = (val as object).constructor?.name ?? 'unknown'
  return {
    kind: 'reject',
    reason:
      `flat-ts: cannot flatten ${ctorName} instances — ` +
      `only plain objects, arrays, Dates, and RegExps are supported. ` +
      `Convert to a plain object first.`,
  }
}

function flattenInto(
  src: Record<string, unknown>,
  prefix: string,
  delimiter: string,
  safe: boolean,
  maxDepth: number,
  depth: number,
  transformKey: ((k: string) => string) | undefined,
  seen: WeakSet<object>,
  out: Record<string, unknown>,
  isArray: boolean,
): void {
  if (depth > maxDepth) {
    out[prefix] = src
    return
  }

  const keys = Object.keys(src)

  // Preserve empty containers so round-trip is lossless.
  if (keys.length === 0 && prefix.length > 0) {
    out[prefix] = isArray ? [] : {}
    return
  }

  for (const rawKey of keys) {
    if (BLOCKED.has(rawKey)) continue

    const key = transformKey ? transformKey(rawKey) : rawKey

    // Guard AFTER transform too — transformKey must not produce a blocked key.
    if (BLOCKED.has(key)) continue

    if (!isArray && key.includes(delimiter)) {
      throw new TypeError(
        `flat-ts: key "${key}" contains the delimiter "${delimiter}". ` +
          `Use a different delimiter (option: delimiter) or sanitize your keys.`,
      )
    }

    const fullKey = prefix.length > 0 ? `${prefix}${delimiter}${key}` : key
    const val = src[rawKey]

    const cls = classifyValue(val)

    if (cls.kind === 'leaf') {
      out[fullKey] = val
      continue
    }

    if (cls.kind === 'reject') {
      throw new TypeError(cls.reason)
    }

    if (safe && cls.kind === 'array') {
      out[fullKey] = val
      continue
    }

    if (seen.has(val as object)) {
      throw new TypeError(
        `flat-ts: circular reference detected at key "${fullKey}"`,
      )
    }

    seen.add(val as object)
    flattenInto(
      val as Record<string, unknown>,
      fullKey,
      delimiter,
      safe,
      maxDepth,
      depth + 1,
      transformKey,
      seen,
      out,
      cls.kind === 'array',
    )
    // Remove after recursion so diamond-shaped structures work correctly.
    seen.delete(val as object)
  }
}

/**
 * Flatten a nested object into a single-depth object with delimited keys.
 *
 * @example
 * flatten({ a: { b: 1 } })          // → { 'a.b': 1 }
 * flatten({ a: { b: 1 } }, { delimiter: '/' }) // → { 'a/b': 1 }
 */
export function flatten<T extends object>(
  obj: T,
  options: FlattenOptions = {},
): FlattenResult<T> {
  if (obj === null || typeof obj !== 'object') {
    throw new TypeError('flat-ts: flatten() expects a non-null object')
  }

  const delimiter = options.delimiter ?? '.'
  if (typeof delimiter !== 'string' || delimiter.length === 0) {
    throw new TypeError('flat-ts: delimiter must be a non-empty string')
  }

  const safe = options.safe ?? false
  const maxDepth = options.maxDepth ?? Infinity
  const transformKey = options.transformKey

  const out: Record<string, unknown> = {}
  const seen = new WeakSet<object>()

  flattenInto(
    obj as Record<string, unknown>,
    '',
    delimiter,
    safe,
    maxDepth,
    0,
    transformKey,
    seen,
    out,
    Array.isArray(obj),
  )

  return out as FlattenResult<T>
}
