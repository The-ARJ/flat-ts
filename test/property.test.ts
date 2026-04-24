import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { flatten, unflatten } from '../src/index.js'

/**
 * Property-based tests. The star property is: for any "well-formed" input,
 * unflatten(flatten(x)) deeply equals x. A "well-formed" input means:
 *   - plain objects and arrays only (no class instances, no Map/Set)
 *   - no object key contains the delimiter
 *   - no reserved keys (__proto__, constructor, prototype) — they're stripped
 *
 * Within those constraints, the library must round-trip losslessly.
 */

const RESERVED = new Set(['__proto__', 'constructor', 'prototype'])

// Arbitrary object keys excluding the delimiter(s), reserved words,
// numeric-only (would be reinterpreted as array indices), and empty.
function makeSafeKey(forbiddenChars: string) {
  return fc.string({ minLength: 1, maxLength: 8 }).filter(
    s =>
      s.length > 0 &&
      !RESERVED.has(s) &&
      !/^\d+$/.test(s) &&
      ![...forbiddenChars].some(c => s.includes(c)),
  )
}

// Leaf values that survive round-trip unchanged under deep equality.
const leaf = fc.oneof(
  fc.integer(),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.string(),
  fc.boolean(),
  fc.constant(null),
)

// Recursive: plain objects and arrays nested to reasonable depth.
function makeNested(forbiddenChars: string): fc.Arbitrary<Record<string, unknown>> {
  const safeKey = makeSafeKey(forbiddenChars)
  return fc.letrec(tie => ({
    value: fc.oneof(
      { weight: 5, arbitrary: leaf },
      { weight: 2, arbitrary: tie('object') as fc.Arbitrary<Record<string, unknown>> },
      { weight: 2, arbitrary: tie('array') as fc.Arbitrary<unknown[]> },
    ),
    object: fc.dictionary(safeKey, tie('value'), { maxKeys: 5 }),
    array: fc.array(tie('value'), { maxLength: 5 }),
  })).object as fc.Arbitrary<Record<string, unknown>>
}

const nested = makeNested('.')
const nestedForPipe = makeNested('|')

describe('property: round-trip', () => {
  it('unflatten(flatten(x)) === x for well-formed inputs (default options)', () => {
    fc.assert(
      fc.property(nested, x => {
        const restored = unflatten(flatten(x))
        expect(restored).toEqual(x)
      }),
      { numRuns: 500 },
    )
  })

  it('round-trip preserves shape under a custom delimiter', () => {
    fc.assert(
      fc.property(nestedForPipe, x => {
        const restored = unflatten(flatten(x, { delimiter: '|' }), { delimiter: '|' })
        expect(restored).toEqual(x)
      }),
      { numRuns: 200 },
    )
  })

  it('round-trip preserves shape with safe:true for arrays', () => {
    fc.assert(
      fc.property(nested, x => {
        const restored = unflatten(flatten(x, { safe: true }))
        expect(restored).toEqual(x)
      }),
      { numRuns: 200 },
    )
  })
})

describe('property: prototype pollution never happens', () => {
  // Adversarial flat-keys targeting prototype chains.
  const evilKey = fc.oneof(
    fc.constant('__proto__'),
    fc.constant('constructor'),
    fc.constant('prototype'),
    fc.constant('__proto__.polluted'),
    fc.constant('a.__proto__.polluted'),
    fc.constant('constructor.prototype.polluted'),
    fc.constant('a.b.__proto__.polluted'),
  )

  const evilInput = fc.dictionary(evilKey, leaf, { minKeys: 1, maxKeys: 3 })

  it('unflatten never pollutes Object.prototype', () => {
    fc.assert(
      fc.property(evilInput, input => {
        const canaryBefore = ({} as Record<string, unknown>).polluted
        try {
          unflatten(input)
        } catch {
          // throws are fine — we only care about pollution
        }
        const canaryAfter = ({} as Record<string, unknown>).polluted
        expect(canaryBefore).toBeUndefined()
        expect(canaryAfter).toBeUndefined()
      }),
      { numRuns: 200 },
    )
  })

  it('flatten never produces a __proto__ / constructor / prototype key', () => {
    fc.assert(
      fc.property(nested, x => {
        const flat = flatten(x)
        for (const k of Object.keys(flat)) {
          for (const seg of k.split('.')) {
            expect(RESERVED.has(seg)).toBe(false)
          }
        }
      }),
      { numRuns: 200 },
    )
  })
})

describe('property: determinism', () => {
  it('flatten is deterministic (same input → same output)', () => {
    fc.assert(
      fc.property(nested, x => {
        expect(flatten(x)).toEqual(flatten(x))
      }),
      { numRuns: 200 },
    )
  })

  it('unflatten is deterministic', () => {
    fc.assert(
      fc.property(nested, x => {
        const flat = flatten(x)
        expect(unflatten(flat)).toEqual(unflatten(flat))
      }),
      { numRuns: 200 },
    )
  })
})

describe('property: invariants', () => {
  it('flatten output has no nested plain objects except empty-container sentinels', () => {
    fc.assert(
      fc.property(nested, x => {
        const flat = flatten(x)
        for (const v of Object.values(flat)) {
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            // Only empty-object sentinels are allowed.
            const proto = Object.getPrototypeOf(v)
            if (proto === Object.prototype || proto === null) {
              expect(Object.keys(v).length).toBe(0)
            }
          }
          if (Array.isArray(v)) {
            // Only empty-array sentinels are allowed (safe:false default).
            expect(v.length).toBe(0)
          }
        }
      }),
      { numRuns: 200 },
    )
  })

  it('every flat key split by the delimiter yields non-empty segments for well-formed input', () => {
    fc.assert(
      fc.property(nested, x => {
        for (const k of Object.keys(flatten(x))) {
          for (const seg of k.split('.')) {
            expect(seg.length).toBeGreaterThan(0)
          }
        }
      }),
      { numRuns: 200 },
    )
  })
})
