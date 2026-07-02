# Phase 1 results (issue #78)

Read-path rework: `runQuery` now reads values with the DuckDB reader's typed API
(`getRows()` + per-column converters built from the result's own column types)
instead of serializing every value to a JSON string and re-parsing dates and
bigints in JS, and `queryDB` no longer runs a `DESCRIBE` before every
data-returning query.

Same machine and environment as [BASELINE.md](./BASELINE.md), same scenario, 10
iterations. Per-iteration timings in `benchmarks/results/*-phase1.csv`.

## Small file — ahccd-sample.csv

| Step           | Phase 0 (s) | Phase 1 (s) | Change |
| -------------- | ----------- | ----------- | ------ |
| Importing      | 0.326       | 0.321       | —      |
| Cleaning       | 0.105       | 0.102       | —      |
| Modifying      | 0.005       | 0.005       | —      |
| Writing        | 0.030       | 0.025       | —      |
| GettingData    | 0.639       | 0.429       | −33%   |
| UpdatingWithJS | 1.067       | 0.865       | −19%   |
| Summarizing    | 0.006       | 0.006       | —      |
| **Total**      | 2.177       | 1.754       | −19%   |

## Big file — ahccd.csv

SQL-only steps unchanged within noise (total 3.789 → 3.598 s).

`getData()` on the cleaned big table (~21.4M rows × 5 columns) still exceeds the
default ~4 GB V8 heap: the JSON strings are gone, but 21M row objects, strings
and `Date`s are materialized either way. With
`--v8-flags=--max-old-space-size=32768` it now completes — `getData()` in 13.5 s
(~10.8 GB heap), `updateWithJS()` in 33.6 s — where the Phase 0 pipeline crashed
regardless. Materializing large tables within the default heap remains Phase 5's
streaming/batching work.

## Behavior changes

- Computed columns that are not part of a table schema (e.g. `count(*)` in
  `sdb.customQuery`) now convert like everything else: BIGINT → number,
  DATE/TIMESTAMP → Date. They previously came back as strings because the
  conversion relied on the target table's schema.
- New one-time warning per column when a BIGINT/HUGEINT value exceeds
  `Number.MAX_SAFE_INTEGER` (the precision loss was previously silent).
- `SimpleDB.customQuery`'s `types` option is removed: values are always
  converted based on the types of the query result itself.
- Everything else is pinned by `test/unit/helpers/valueConversion.test.ts`.
