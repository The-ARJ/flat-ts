import { describe, it, expect } from 'vitest'
import { unflatten } from '../src/index.js'

describe('unflatten', () => {
  it('unflattens a simple flat object', () => {
    expect(unflatten({ 'a.b': 1 })).toEqual({ a: { b: 1 } })
  })

  it('unflattens deep paths', () => {
    expect(unflatten({ 'a.b.c.d': 1 })).toEqual({ a: { b: { c: { d: 1 } } } })
  })

  it('unflattens multiple keys into merged object', () => {
    expect(unflatten({ 'a.b': 1, 'a.c': 2, d: 3 })).toEqual({
      a: { b: 1, c: 2 },
      d: 3,
    })
  })

  it('respects custom delimiter', () => {
    expect(unflatten({ 'a/b': 1 }, { delimiter: '/' })).toEqual({ a: { b: 1 } })
  })

  it('creates arrays for numeric keys by default', () => {
    expect(unflatten({ 'a.0': 'x', 'a.1': 'y' })).toEqual({ a: ['x', 'y'] })
  })

  it('forces objects for numeric keys when object: true', () => {
    expect(unflatten({ 'a.0': 'x' }, { object: true })).toEqual({ a: { '0': 'x' } })
  })

  it('applies transformKey to every segment', () => {
    expect(
      unflatten({ 'FOOBAR.BAZQUX': 1 }, { transformKey: k => k.toLowerCase() }),
    ).toEqual({ foobar: { bazqux: 1 } })
  })

  it('throws when a primitive would be overwritten without overwrite:true', () => {
    expect(() =>
      unflatten({ 'a': 1, 'a.b': 2 }),
    ).toThrow()
  })

  it('allows overwriting primitives when overwrite: true', () => {
    expect(unflatten({ 'a': 1, 'a.b': 2 }, { overwrite: true })).toEqual({
      a: { b: 2 },
    })
  })

  it('blocks prototype-pollution keys', () => {
    const evil = { '__proto__.x': 1, 'a.b': 2 }
    const result = unflatten(evil)
    expect(({} as Record<string, unknown>)['x']).toBeUndefined()
    expect(result).toHaveProperty('a.b', 2)
  })

  it('returns empty object for empty input', () => {
    expect(unflatten({})).toEqual({})
  })

  it('throws for non-object input', () => {
    expect(() => unflatten(null as unknown as Record<string, unknown>)).toThrow(TypeError)
  })

  it('round-trips with flatten', async () => {
    const { flatten } = await import('../src/index.js')
    const original = { a: { b: { c: 1 }, d: 'hello' }, e: true }
    expect(unflatten(flatten(original))).toEqual(original)
  })
})
