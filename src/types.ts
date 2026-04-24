export type Primitive =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined

/** Values that should not be recursed into — treated as flat leaves. */
export type Leaf = Primitive | Date | RegExp | Function

type IsLeaf<T> = T extends Leaf ? true : false

/**
 * Produces the union of all dot-notation leaf paths in T.
 * e.g. { a: { b: number; c: string } } → 'a.b' | 'a.c'
 */
export type LeafPaths<T, D extends string = '.'> = {
  [K in keyof T & string]: IsLeaf<T[K]> extends true
    ? K
    : T[K] extends readonly any[]
      ? K  // treat arrays as leaves (default safe-array behaviour)
      : T[K] extends object
        ? `${K}${D}${LeafPaths<T[K], D>}`
        : K
}[keyof T & string]

/** Resolves the value type at a dot-notation path P inside T. */
export type PathValue<
  T,
  P extends string,
  D extends string = '.',
> = P extends `${infer K}${D}${infer Rest}`
  ? K extends keyof T
    ? PathValue<T[K], Rest, D>
    : never
  : P extends keyof T
    ? T[P]
    : never

/** The fully flattened type of T using delimiter D. */
export type FlattenResult<T extends object, D extends string = '.'> = {
  [P in LeafPaths<T, D>]: PathValue<T, P, D>
}

// ── Options ────────────────────────────────────────────────────────────────

export interface FlattenOptions {
  /** Key delimiter. Default: `'.'` */
  delimiter?: string
  /** When true, arrays are not flattened. Default: `false` */
  safe?: boolean
  /** Maximum recursion depth. Default: `Infinity` */
  maxDepth?: number
  /** Optional key transform applied to every segment. */
  transformKey?: (key: string) => string
}

export interface UnflattenOptions {
  /** Key delimiter. Default: `'.'` */
  delimiter?: string
  /**
   * When true, numeric path segments always produce objects instead of arrays.
   * Default: `false`
   */
  object?: boolean
  /**
   * When true, existing primitive values at a path are overwritten instead of
   * throwing. Also allows a primitive to overwrite an existing nested object
   * (the reverse direction), making collision detection order-independent.
   * Default: `false`
   */
  overwrite?: boolean
  /**
   * Maximum array index that unflatten will materialize. Prevents
   * OOM from untrusted input like `{ 'a.999999999': 1 }`. Exceeding
   * the cap throws a RangeError. Default: `10_000`.
   */
  maxArrayIndex?: number
  /** Optional key transform applied to every segment. */
  transformKey?: (key: string) => string
}
