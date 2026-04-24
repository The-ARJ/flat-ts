# flat-ts

> TypeScript-first flatten/unflatten for nested objects.  
> Modern ESM + CJS replacement for [`flat`](https://www.npmjs.com/package/flat) with full type inference and prototype-pollution protection.

```ts
import { flatten, unflatten } from '@the-arj/flat-ts'

const obj = { a: { b: { c: 1 }, d: 'hello' }, e: true }

flatten(obj)
// → { 'a.b.c': 1, 'a.d': 'hello', e: true }
// TypeScript infers: { 'a.b.c': number; 'a.d': string; e: boolean }

unflatten({ 'a.b.c': 1, 'a.d': 'hello', e: true })
// → { a: { b: { c: 1 }, d: 'hello' }, e: true }
```

---

## Why flat-ts?

| | `flat` | **flat-ts** |
|---|:---:|:---:|
| Built-in TypeScript types | ✗ | ✅ |
| Inferred output types | ✗ | ✅ |
| ESM (`import`) | ✗ | ✅ |
| CJS (`require`) | ✅ | ✅ |
| Prototype-pollution guard | Partial | ✅ |
| Circular reference detection | Silent | ✅ throws |
| Diamond-shape support | ✗ | ✅ |
| Active maintenance | ✗ (2023) | ✅ |

---

## Install

```sh
npm install @the-arj/flat-ts
```

Requires **Node.js ≥ 16**.

---

## API

### `flatten(obj, options?)`

Converts a nested object into a single-depth object with delimited keys.

```ts
import { flatten } from '@the-arj/flat-ts'

flatten({ a: { b: 1, c: 2 }, d: 3 })
// → { 'a.b': 1, 'a.c': 2, d: 3 }
```

#### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `delimiter` | `string` | `'.'` | Key delimiter |
| `safe` | `boolean` | `false` | When `true`, arrays are preserved as-is |
| `maxDepth` | `number` | `Infinity` | Stop recursing beyond this depth |
| `transformKey` | `(key: string) => string` | — | Applied to every key segment |

```ts
// Custom delimiter
flatten({ a: { b: 1 } }, { delimiter: '/' })
// → { 'a/b': 1 }

// Preserve arrays
flatten({ a: [1, 2, 3] }, { safe: true })
// → { a: [1, 2, 3] }

// Limit depth
flatten({ a: { b: { c: 1 } } }, { maxDepth: 1 })
// → { 'a.b': { c: 1 } }

// Transform keys
flatten({ fooBar: { bazQux: 1 } }, { transformKey: k => k.toLowerCase() })
// → { 'foobar.bazqux': 1 }
```

---

### `unflatten(obj, options?)`

Restores a flat object back to its nested form.

```ts
import { unflatten } from '@the-arj/flat-ts'

unflatten({ 'a.b': 1, 'a.c': 2, d: 3 })
// → { a: { b: 1, c: 2 }, d: 3 }
```

Numeric path segments automatically produce arrays:

```ts
unflatten({ 'a.0': 'x', 'a.1': 'y' })
// → { a: ['x', 'y'] }
```

#### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `delimiter` | `string` | `'.'` | Key delimiter |
| `object` | `boolean` | `false` | When `true`, numeric segments produce objects, not arrays |
| `overwrite` | `boolean` | `false` | When `true`, primitives at a path are silently overwritten |
| `transformKey` | `(key: string) => string` | — | Applied to every key segment |

---

## TypeScript — Type Inference

`flatten` infers the output type from your input:

```ts
const result = flatten({ user: { name: 'Alice', age: 30 }, active: true })
//    ^? { 'user.name': string; 'user.age': number; active: boolean }
```

You can also use the exported utility types directly:

```ts
import type { FlattenResult, LeafPaths, PathValue } from '@the-arj/flat-ts'

type MyObj = { a: { b: number; c: string }; d: boolean }

type Flat    = FlattenResult<MyObj>         // { 'a.b': number; 'a.c': string; d: boolean }
type Paths   = LeafPaths<MyObj>             // 'a.b' | 'a.c' | 'd'
type ValAtAB = PathValue<MyObj, 'a.b'>      // number
```

---

## Safety

### Prototype pollution

`flatten` and `unflatten` silently skip keys named `__proto__`, `constructor`, and `prototype`. No polluted prototypes, ever.

### Circular references

```ts
const obj: Record<string, unknown> = { a: 1 }
obj.self = obj

flatten(obj) // throws TypeError: flat-ts: circular reference detected at key "self"
```

### Diamond-shaped structures

Shared (non-circular) references are handled correctly without false positives:

```ts
const shared = { x: 1 }
flatten({ a: shared, b: shared }) // → { 'a.x': 1, 'b.x': 1 } ✅
```

---

## Round-trip

```ts
import { flatten, unflatten } from '@the-arj/flat-ts'

const original = { a: { b: { c: 1 }, d: 'hi' } }
unflatten(flatten(original))
// → { a: { b: { c: 1 }, d: 'hi' } }  ✅
```

---

## License

MIT © [The-ARJ](https://github.com/The-ARJ)
