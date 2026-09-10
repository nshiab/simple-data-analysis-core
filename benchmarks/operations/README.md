# Running the Core benchmarks

Run `deno task benchmark-core` to update the focused operation tables in the
[root README](../../README.md#focused-operation-benchmarks). The existing
`deno task benchmark` continues to update only the tabular and spatial results.
These generated fixtures need no downloads: one million rows for the join and
100,000 rows for each ordinary transfer and point update, and 1,000 rows for
complex polygon updates. Use `--iterations=5` for more repetitions or
`--rows=100` to override every fixture size for a quick run. Large overrides
also apply to polygons, so increase them with care.

Geometry updates cover points and polygons, attribute enrichment and coordinate
edits, each with all input rows at once or batches (1,000 points or 100
polygons). Each polygon has one ring with 1,001 positions, including ring
closure. The README shows only coordinate-edit results, with and without
batching, for a compact eight-row comparison. Attribute-only results remain in
the raw observations. Both implementations start from the same SQL-generated
fixture without retaining a full JavaScript input array. Spatial extension
loading happens outside the timer; a first run may download the extension.

Core's public methods are compared with equivalent handwritten DuckDB
operations. Both use warm connections with one thread, a 1 GB memory limit, UTC,
compressed in-memory storage and disabled external-file caching. Duration
excludes startup, fixture creation, warm-up and correctness validation.
`loadArray()` starts with an already-created JS array; `getData()` includes
reading and JS object conversion. Batched updates increment a numeric column in
JavaScript on both implementations; the native baseline uses a row appender and
rowid ranges. This compares complete transfer operations, not an isolated SQL
overhead. The numeric baseline has a fixed schema and writes directly to a
separate result table; Core also handles general types and stages the update
before replacing the input. The difference in duration is not solely API
overhead. Keep all three transfer operations: separate reads and writes help
explain changes in the round-trip timing. Full output rows are checked after
both the warm-up and measured operation.

The geometry baseline is handwritten against DuckDB's node API and the fixed
fixture schema. It uses the same geometry-cell validator as Core, checks binary
GeoJSON round-trip fidelity, parses and validates input geometries in
JavaScript, runs the same callback, validates and serializes the output, appends
text in chunks, and converts it into staged SQL geometry before replacing the
input. These steps are timed for both implementations. Attribute enrichment
still transfers geometry; coordinate edits also shift every longitude by 0.01
degrees. This measures complete JavaScript updates, including Core's general
schema and queue handling. It does not compare JavaScript updates with SQL-only
updates.

After warm-up and measurement, geometry validation compares every row's ID,
label and binary geometry, preserving duplicate counts, and checks the geometry
SQL type and CRS. These checks run in SQL to avoid an additional full JavaScript
copy of the polygon dataset. A batch size shown as — means all input rows at
once. Batching limits input row counts, not geometry size, callback expansion,
or total conversion work.

**Memory is whole-process peak RSS**, including setup, warm-up and validation,
not memory attributable solely to the timed operation. The tables report its
mean across fresh processes; duration variation is the population standard
deviation. Implementation order alternates between repetitions. Like the
existing benchmark command, this command requires macOS for `/usr/bin/time -l`.
Results are local warm-run measurements, not cross-platform guarantees. Raw
observations and runtime versions are retained in
`benchmarks/.work/operations.json`.

## Batched update investigation, September 10, 2026

Profiling the numeric fixture identified an avoidable cost in preparing callback
rows: each row received an internal pagination property that was then deleted.
With 1,000-row batches, input preparation took about 10 ms and the object-spread
callback took about 23 ms. Keeping the final native cursor separate from row
objects reduced those phases to about 2 ms and 1 ms. Selection SQL, value
conversion, batch sizes, staging, and cleanup are unchanged.

Five fresh-process samples before and after the change, using
`deno task benchmark-core --iterations=5`, gave these results for 100,000 rows:

| Batch size | Before duration ± SD | After duration ± SD | Before peak RSS | After peak RSS |
| ---------: | -------------------: | ------------------: | --------------: | -------------: |
|      1,000 |     111.57 ± 3.65 ms |     81.55 ± 0.94 ms |       204.7 MiB |      207.8 MiB |
|     10,000 |      74.63 ± 1.77 ms |     38.83 ± 0.19 ms |       249.7 MiB |      212.9 MiB |

This is a 27% and 48% reduction in duration, respectively. Peak RSS remains a
whole-process measurement; the small-batch run did not reduce it. Measurements
used an Apple M4 Max, macOS arm64, Deno 2.9.6, and DuckDB 1.5.5 / node-api
1.5.5-r.4, comparing revision `00cf3dc7fd92a426e076fd792623cb0d0b4a5c4b` with
the cursor-separation change. Diagnostic instrumentation was excluded from these
comparison timings. Local raw samples are retained as
`benchmarks/.work/updateWithJS-before.json` and
`benchmarks/.work/updateWithJS-after.json`.

A separate check on 250,003 rows exercised a final partial batch. Three
alternating before/after runs reduced mean duration from 283.87 to 197.89 ms at
batch size 1,000, and from 205.02 to 111.02 ms at batch size 10,000. Output
validation passed; samples are in `benchmarks/.work/updateWithJS-partial.json`.
This remains an investigation check rather than an additional default workload.

## Batched polygon investigation, September 10, 2026

Starting from the cursor improvement above, profiling isolated the remaining
polygon gap to batch reading. `EXPLAIN ANALYZE` showed GeoJSON conversion below
the batch limit: the first query converted 1,000 polygons to return only 100.
The next query repeated conversion for remaining rows. Selecting the batch in a
subquery before converting geometry reduced total batch-read time from about 185
ms to 44 ms. The outer query explicitly preserves cursor order. Geometry
validation, staging, and callback behavior remain unchanged.

Five alternating before/after pairs in fresh processes, using the same runtime
and settings as above, measured 1,000 polygons in batches of 100:

| Update    | Before duration ± SD | After duration ± SD | Before peak RSS | After peak RSS |
| --------- | -------------------: | ------------------: | --------------: | -------------: |
| Attribute |     526.39 ± 1.75 ms |    386.15 ± 2.44 ms |       752.4 MiB |      754.4 MiB |
| Geometry  |     534.61 ± 3.82 ms |    393.37 ± 1.51 ms |       709.1 MiB |      726.8 MiB |

Duration fell by about 26–27%. Whole-process peak RSS did not improve and was
slightly higher in these runs. The comparison excluded profiling instrumentation
and validated full output values and geometry binary representations. Raw
samples and query plans are retained locally in
`benchmarks/.work/polygons-comparison.json` and
`benchmarks/.work/polygons-query-plans.txt`. The default workloads are
unchanged.
