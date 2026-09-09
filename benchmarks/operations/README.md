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
closure. Both implementations start from the same SQL-generated fixture without
retaining a full JavaScript input array. Spatial extension loading happens
outside the timer; a first run may download the extension.

Core's public methods are compared with equivalent handwritten DuckDB
operations. Both use warm connections with one thread, a 1 GB memory limit, UTC,
compressed in-memory storage and disabled external-file caching. Duration
excludes startup, fixture creation, warm-up and correctness validation.
`loadArray()` starts with an already-created JS array; `getData()` includes
reading and JS object conversion. Batched updates increment a numeric column in
JavaScript on both implementations; the native baseline uses a row appender and
rowid ranges. This compares complete transfer operations, not an isolated SQL
overhead. Full output rows are checked after both the warm-up and measured
operation.

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
