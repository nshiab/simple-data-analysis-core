# Phase 5 results (issue #78)

Streaming reads — purely additive, no existing behavior changed.

## `table.stream(options)`

New async iterator over rows, built on DuckDB's streaming result
(`connection.stream()` + chunk fetching), with the same typed value conversion
as the Phase 1 read path. Takes the same `columns` and `conditions` options as
`getData()`. Breaking out of the loop early is safe, and geometry tables are
refused like `getData()`.

```ts
for await (const row of table.stream()) {
  // one row object at a time
}
```

## Batched `updateWithJS`

New `{ batchSize }` option. Rows are pulled in batches by `rowid`, passed
through the modifier one batch at a time, and accumulated in a temporary DuckDB
table that replaces the original at the end — so only one batch of rows is
materialized in JS memory at any moment. The modifier is called once per batch.
Without the option, behavior is exactly as before.

## Big-file verification (default V8 heap, ~4 GB)

Cleaned AHCCD big table: 21,365,761 rows × 5 columns — the case recorded as a
fatal out-of-memory crash in [BASELINE.md](./BASELINE.md), and only possible
with a 32 GB heap flag after Phase 1.

| Operation                          | Time   | JS heap |
| ---------------------------------- | ------ | ------- |
| `stream()` over all rows           | 10.5 s | 12 MB   |
| `updateWithJS` (batchSize 500,000) | 35.1 s | 210 MB  |

Both complete at the default heap. For comparison, Phase 1's `getData()` on the
same table required `--max-old-space-size=32768` and ~10.8 GB of heap, and Phase
0 crashed regardless of the flag.
