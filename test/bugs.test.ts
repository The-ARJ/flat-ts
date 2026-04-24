import { describe, it, expect } from 'vitest'
import { flatten, unflatten } from '../src/index.js'

/**
 * Regression tests for bugs fixed in the QA pass. Each test documents:
 *   1. The original broken behavior (in a comment),
 *   2. The new, correct behavior (asserted).
 */

describe('regressions — flatten', () => {
  it('preserves empty nested objects as sentinel leaves (was: silently dropped)', () => {
    const input = { a: {}, b: { c: 1 } }
    const flat = flatten(input)
    expect(flat).toEqual({ a: {}, 'b.c': 1 })
    // Round-trip is now lossless:
    expect(unflatten(flat)).toEqual(input)
  })

  it('preserves empty arrays as sentinel leaves (was: silently dropped)', () => {
    const input = { a: [], b: { c: 1 } }
    const flat = flatten(input)
    expect(flat).toEqual({ a: [], 'b.c': 1 })
    expect(unflatten(flat)).toEqual(input)
  })

  it('throws on Map values instead of silently dropping', () => {
    const input = { cfg: new Map([['k', 'v']]) }
    expect(() => flatten(input)).toThrow(/cannot flatten Map/)
  })

  it('throws on Set values instead of silently dropping', () => {
    const input = { s: new Set([1, 2, 3]) }
    expect(() => flatten(input)).toThrow(/cannot flatten Set/)
  })

  it('throws on class instances instead of silently stripping identity', () => {
    class Point {
      constructor(public x: number, public y: number) {}
    }
    expect(() => flatten({ p: new Point(3, 4) })).toThrow(/cannot flatten Point/)
  })

  it('still treats Date and RegExp as leaves', () => {
    const d = new Date('2024-01-01')
    const re = /foo/gi
    expect(flatten({ d, re })).toEqual({ d, re })
  })

  it('throws when a literal key contains the delimiter (was: silent collision)', () => {
    expect(() => flatten({ 'a.b': { c: 1 } })).toThrow(/contains the delimiter/)
    // A different delimiter works fine:
    expect(flatten({ 'a.b': { c: 1 } }, { delimiter: '/' })).toEqual({ 'a.b/c': 1 })
  })

  it('rejects transformKey output containing the delimiter', () => {
    expect(() =>
      flatten({ foo: { bar: 1 } }, { transformKey: k => `${k}.x` }),
    ).toThrow(/contains the delimiter/)
  })

  it('blocks __proto__ produced by transformKey (was: only raw key was checked)', () => {
    const input = { a: 1, b: { c: 2 } }
    const out = flatten(input, {
      transformKey: k => (k === 'a' ? '__proto__' : k),
    })
    // __proto__ segment is dropped entirely; sibling data survives.
    expect(out).toEqual({ 'b.c': 2 })
  })

  it('rejects an empty-string delimiter', () => {
    expect(() => flatten({ a: 1 }, { delimiter: '' })).toThrow(/delimiter/)
  })
})

describe('regressions — unflatten', () => {
  it('round-trips empty nested containers (was: lost)', () => {
    const original = { a: {}, b: [], c: { d: 1 }, e: [1, 2] }
    expect(unflatten(flatten(original))).toEqual(original)
  })

  it('rejects leading-zero numeric segments — treats as object key (was: allocated bogus array)', () => {
    const out = unflatten({ 'a.01': 'x' }) as { a: { '01': string } }
    // '01' no longer matches the strict numeric regex, so we get a plain object key.
    expect(out).toEqual({ a: { '01': 'x' } })
  })

  it('throws on array index above maxArrayIndex (was: allocated huge sparse array)', () => {
    expect(() => unflatten({ 'a.999999': 'x' })).toThrow(/maxArrayIndex/)
  })

  it('respects a custom maxArrayIndex cap', () => {
    expect(() => unflatten({ 'a.50': 'x' }, { maxArrayIndex: 10 })).toThrow(/maxArrayIndex/)
    const out = unflatten({ 'a.50': 'x' }, { maxArrayIndex: 100 }) as { a: unknown[] }
    expect(out.a.length).toBe(51)
    expect(out.a[50]).toBe('x')
  })

  it('maxArrayIndex is bypassed when object:true is set', () => {
    // With object:true, numeric segments are treated as object keys so no array is allocated.
    const out = unflatten({ 'a.999999': 'x' }, { object: true })
    expect(out).toEqual({ a: { '999999': 'x' } })
  })

  it('throws symmetrically on collision regardless of flat-key order (was: order-dependent)', () => {
    // Forward order: primitive then nested → throws
    expect(() => unflatten({ a: 1, 'a.b': 2 })).toThrow()
    // Reverse order: nested then primitive → now also throws (was silent)
    expect(() => unflatten({ 'a.b': 2, a: 1 })).toThrow()
    // And the object-first-then-primitive case:
    expect(() => unflatten({ 'x.y.z': 'nested', x: 'primitive' })).toThrow()
  })

  it('overwrite: true allows collisions in both directions', () => {
    expect(unflatten({ a: 1, 'a.b': 2 }, { overwrite: true })).toEqual({ a: { b: 2 } })
    expect(unflatten({ 'a.b': 2, a: 1 }, { overwrite: true })).toEqual({ a: 1 })
  })

  it('rejects the whole key when any segment is blocked — no partial writes (was: orphan object left behind)', () => {
    const out = unflatten({ 'a.constructor.x': 1, 'safe.ok': 2 })
    // `a` is NOT created — the entire key is skipped.
    expect(out).toEqual({ safe: { ok: 2 } })
    expect(Object.prototype.hasOwnProperty.call(out, 'a')).toBe(false)
  })

  it('does not pollute Object.prototype via __proto__ paths', () => {
    const before = ({} as Record<string, unknown>).polluted
    unflatten({ '__proto__.polluted': 'yes' })
    const after = ({} as Record<string, unknown>).polluted
    expect(before).toBeUndefined()
    expect(after).toBeUndefined()
  })

  it('rejects an empty-string delimiter', () => {
    expect(() => unflatten({ a: 1 }, { delimiter: '' })).toThrow(/delimiter/)
  })

  it('numeric keys >= 0 without leading zeros still create arrays', () => {
    expect(unflatten({ 'a.0': 'x', 'a.1': 'y' })).toEqual({ a: ['x', 'y'] })
  })

  it('prototype method names ("toString", "valueOf", "hasOwnProperty") are treated as absent keys', () => {
    // Previously, cursor[part] returned the inherited method for part="valueOf",
    // causing spurious collision errors for well-formed input. Now fixed via hasOwn().
    const input = {
      'a.toString': 'str',
      'a.valueOf': 42,
      'a.hasOwnProperty': true,
    }
    const out = unflatten(input) as { a: Record<string, unknown> }
    expect(out.a['toString']).toBe('str')
    expect(out.a['valueOf']).toBe(42)
    expect(out.a['hasOwnProperty']).toBe(true)
    // Round-trip uses an opaque type to avoid deep inference.
    const rt = unflatten(flatten(out as Record<string, unknown>))
    expect(rt).toEqual(out)
  })
})
