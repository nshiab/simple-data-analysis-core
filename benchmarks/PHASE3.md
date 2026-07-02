# Phase 3 results (issue #78)

Type-level only: the row-value union
`{ [key: string]: string | number | boolean | Date | null }` is replaced by
`{ [key: string]: unknown }` across all signatures — returned rows (`getData`,
`getFirstRow`, `getTop`, `customQuery`, …), value getters (`getValues`,
`getUniques`, `getMin`, `getMax`, `getExtent`), and the rows passed to
`updateWithJS` callbacks. The type is written inline everywhere (no alias),
matching the codebase style.

Not changed: the value unions in `keep()` and `remove()` options stay as they
are — they describe what users may pass in, where the explicit union is useful,
rather than what DuckDB returns.

Rationale (from #78): the union forced the same narrowing/casting as `unknown`
in practice while being wrong for `STRUCT`/`LIST`/`MAP`/`INTERVAL` values, which
are legitimately returned as objects and arrays.

## Compatibility

Runtime behavior is identical — no benchmark run needed. This is the one
type-level break in the roadmap: strict-TS consumers assigning row values to the
old union (e.g. `const s: string | number | ... = row.a`) must now narrow or
cast. Code that already narrowed (`typeof`, `instanceof`) or used
`assertEquals`-style comparisons compiles unchanged.
