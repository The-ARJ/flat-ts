import type { UnflattenOptions } from './types.js'

/** Keys that must never be written during unflatten — prototype-pollution guard. */
const BLOCKED = new Set(['__proto__', 'constructor', 'prototype'])

/** Strict: only non-negative integers without leading zeros. */
const NUMERIC_RE = /^(0|[1-9]\d*)$/

/** Default cap for array indices created during unflatten. Prevents OOM from
 *  untrusted input like `{ 'a.999999999': 1 }`. Override with maxArrayIndex. */
const DEFAULT_MAX_ARRAY_INDEX = 10_000

function isPlainContainer(val: unknown): val is Record<string, unknown> | unknown[] {
  if (val === null || typeof val !== 'object') return false
  if (Array.isArray(val)) return true
  const proto = Object.getPrototypeOf(val)
  return proto === Object.prototype || proto === null
}

/** Own-property check — guards against inherited names like "toString"
 *  / "valueOf" masquerading as existing keys during path traversal. */
function hasOwn(obj: Record<string, unknown> | unknown[], key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

/**
 * Restore a flattened object back to its nested form.
 *
 * @example
 * unflatten({ 'a.b': 1 })          // → { a: { b: 1 } }
 * unflatten({ 'a/b': 1 }, { delimiter: '/' }) // → { a: { b: 1 } }
 */
export function unflatten<T extends object = Record<string, unknown>>(
  obj: Record<string, unknown>,
  options: UnflattenOptions = {},
): T {
  if (obj === null || typeof obj !== 'object') {
    throw new TypeError('flat-ts: unflatten() expects a non-null object')
  }

  const delimiter = options.delimiter ?? '.'
  if (typeof delimiter !== 'string' || delimiter.length === 0) {
    throw new TypeError('flat-ts: delimiter must be a non-empty string')
  }

  const forceObject = options.object ?? false
  const overwrite = options.overwrite ?? false
  const transformKey = options.transformKey
  const maxArrayIndex = options.maxArrayIndex ?? DEFAULT_MAX_ARRAY_INDEX

  const result: Record<string, unknown> = {}

  for (const flatKey of Object.keys(obj)) {
    const rawParts = flatKey.split(delimiter)
    const parts = transformKey ? rawParts.map(transformKey) : rawParts

    // Reject the whole key if any segment is blocked — no partial writes.
    if (parts.some(p => BLOCKED.has(p))) continue

    // Validate numeric segments against the cap up-front so we don't
    // allocate a giant array and then throw mid-write.
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i]!
      if (!forceObject && NUMERIC_RE.test(p)) {
        const idx = Number(p)
        if (idx > maxArrayIndex) {
          throw new RangeError(
            `flat-ts: array index ${idx} at path "${parts.slice(0, i + 1).join(delimiter)}" ` +
              `exceeds maxArrayIndex (${maxArrayIndex}). ` +
              `Raise maxArrayIndex or pass { object: true } to treat numeric segments as object keys.`,
          )
        }
      }
    }

    const value = obj[flatKey]

    // Special case: a single-segment key assigns directly to the root.
    if (parts.length === 1) {
      const only = parts[0]!
      assignLeaf(result, only, value, overwrite, flatKey)
      continue
    }

    let cursor: Record<string, unknown> | unknown[] = result

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!
      const nextPart = parts[i + 1]!
      const nextIsNumeric = !forceObject && NUMERIC_RE.test(nextPart)

      const cursorObj = cursor as Record<string, unknown>
      const existing: unknown = hasOwn(cursorObj, part) ? cursorObj[part] : undefined

      if (existing === undefined || existing === null) {
        const created: Record<string, unknown> | unknown[] = nextIsNumeric ? [] : {}
        cursorObj[part] = created
        cursor = created
      } else if (isPlainContainer(existing)) {
        // If the shape disagrees with what's already there (array vs object),
        // keep the existing container — flat keys can legitimately target
        // the same container from different directions.
        cursor = existing
      } else {
        if (!overwrite) {
          throw new TypeError(
            `flat-ts: cannot unflatten — key "${parts.slice(0, i + 1).join(delimiter)}" ` +
              `already holds a primitive value. Use { overwrite: true } to allow overwriting.`,
          )
        }
        const created: Record<string, unknown> | unknown[] = nextIsNumeric ? [] : {}
        cursorObj[part] = created
        cursor = created
      }
    }

    const last = parts[parts.length - 1]!
    assignLeaf(cursor as Record<string, unknown>, last, value, overwrite, flatKey)
  }

  return result as T
}

/**
 * Assign a value at the final segment. If an object already sits there and
 * we're about to overwrite it with a primitive (the reverse of the classic
 * collision), throw unless overwrite is allowed. This makes collision
 * detection symmetric regardless of flat-key iteration order.
 *
 * When the incoming value is itself a plain container (from the empty-
 * container preservation feature), merging is allowed: {a:{b:1}} + {a:{}}
 * should not blow away {b:1}.
 */
function assignLeaf(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
  overwrite: boolean,
  flatKey: string,
): void {
  if (!hasOwn(target, key)) {
    target[key] = value
    return
  }
  const existing = target[key]

  // Primitive replacing an object → collision.
  if (isPlainContainer(existing) && !isPlainContainer(value)) {
    if (!overwrite) {
      throw new TypeError(
        `flat-ts: cannot unflatten — key "${flatKey}" would overwrite an existing ` +
          `nested object with a primitive. Use { overwrite: true } to allow overwriting.`,
      )
    }
    target[key] = value
    return
  }

  // Empty-container sentinel arriving on top of an existing container → leave existing.
  if (isPlainContainer(existing) && isPlainContainer(value)) {
    const valueKeys = Array.isArray(value) ? value.length : Object.keys(value).length
    if (valueKeys === 0) return // merge: keep richer existing
    // Both non-empty: not expected from well-formed flat input; overwrite only if allowed.
    if (!overwrite) {
      throw new TypeError(
        `flat-ts: cannot unflatten — key "${flatKey}" has conflicting values. ` +
          `Use { overwrite: true } to allow overwriting.`,
      )
    }
    target[key] = value
    return
  }

  // Existing primitive, new primitive — last-write-wins is the documented behavior
  // when there are no conflicting shapes.
  target[key] = value
}
