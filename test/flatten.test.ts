import { describe, it, expect } from 'vitest'
import { flatten } from '../src/index.js'

describe('flatten', () => {
  it('flattens a simple nested object', () => {
    expect(flatten({ a: { b: 1 } })).toEqual({ 'a.b': 1 })
  })

  it('flattens deeply nested objects', () => {
    expect(flatten({ a: { b: { c: { d: 1 } } } })).toEqual({ 'a.b.c.d': 1 })
  })

  it('flattens multiple branches', () => {
    expect(
      flatten({ a: { b: 1, c: 2 }, d: 3 }),
    ).toEqual({ 'a.b': 1, 'a.c': 2, d: 3 })
  })

  it('respects custom delimiter', () => {
    expect(flatten({ a: { b: 1 } }, { delimiter: '/' })).toEqual({ 'a/b': 1 })
  })

  it('respects maxDepth', () => {
    const nested = { a: { b: { c: 1 } } }
    expect(flatten(nested, { maxDepth: 1 })).toEqual({ 'a.b': { c: 1 } })
  })

  it('preserves Date as a leaf', () => {
    const d = new Date('2024-01-01')
    expect(flatten({ created: d })).toEqual({ created: d })
  })

  it('preserves RegExp as a leaf', () => {
    const re = /foo/gi
    expect(flatten({ pattern: re })).toEqual({ pattern: re })
  })

  it('flattens arrays by default (safe: false)', () => {
    expect(flatten({ a: [1, 2, 3] })).toEqual({
      'a.0': 1,
      'a.1': 2,
      'a.2': 3,
    })
  })

  it('preserves arrays when safe: true', () => {
    const arr = [1, 2, 3]
    expect(flatten({ a: arr }, { safe: true })).toEqual({ a: arr })
  })

  it('handles null values', () => {
    expect(flatten({ a: { b: null } })).toEqual({ 'a.b': null })
  })

  it('handles undefined values', () => {
    expect(flatten({ a: { b: undefined } })).toEqual({ 'a.b': undefined })
  })

  it('applies transformKey to every segment', () => {
    expect(
      flatten({ fooBar: { bazQux: 1 } }, { transformKey: k => k.toLowerCase() }),
    ).toEqual({ 'foobar.bazqux': 1 })
  })

  it('blocks prototype-pollution keys', () => {
    const evil = JSON.parse('{"__proto__":{"x":1},"a":{"b":2}}') as Record<string, unknown>
    const result = flatten(evil)
    expect(result).not.toHaveProperty('__proto__.x')
    expect(result).toHaveProperty('a.b', 2)
  })

  it('throws on circular references', () => {
    const obj: Record<string, unknown> = { a: 1 }
    obj['self'] = obj
    expect(() => flatten(obj)).toThrow('circular reference')
  })

  it('handles diamond-shaped (shared reference) structures without throwing', () => {
    const shared = { x: 1 }
    expect(() => flatten({ a: shared, b: shared })).not.toThrow()
  })

  it('returns empty object for empty input', () => {
    expect(flatten({})).toEqual({})
  })

  it('throws for non-object input', () => {
    expect(() => flatten(null as unknown as object)).toThrow(TypeError)
  })
})
