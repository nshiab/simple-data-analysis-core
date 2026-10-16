**Simple Data Analysis Core v2.1.15**

***

# Simple data analysis core (SDA-core)

SDA-core is a lightweight DuckDB-powered TypeScript library for tabular, SQL,
CSV, Parquet, and geospatial data analysis on Node.js. It has one runtime dependency: DuckDB.
It requires Node.js 24.21.0 or newer and uses ECMAScript modules (ESM).

Choose this package for core data loading, cleaning, joining, statistics, and
geospatial operations. For AI, vector search, Google Sheets, and data
visualization features, use the full
[simple-data-analysis library](https://github.com/nshiab/simple-data-analysis).

The library is available on
[npm](https://www.npmjs.com/package/@nshiab/simple-data-analysis-core), with its
[API documentation](https://nshiab.github.io/simple-data-analysis-core/).

AI coding assistants and agents can start with the concise
[llms.txt](https://github.com/nshiab/simple-data-analysis-core/blob/main/llms.txt)
index. The complete generated API reference is available in
[llm.md](https://github.com/nshiab/simple-data-analysis-core/blob/main/llm.md).

The library is maintained by [Nael Shiab](http://naelshiab.com/), computational
journalist and senior data producer for [CBC News](https://www.cbc.ca/news).

> [!TIP]
> To learn how to use SDA, check out
> [Code Like a Journalist](https://www.code-like-a-journalist.com/), a free and
> open-source data analysis and data visualization course in TypeScript.

## Installation

```bash
npm i @nshiab/simple-data-analysis-core
```

Use `"type": "module"` in your project’s `package.json` and import the public
classes from `@nshiab/simple-data-analysis-core`. Extension utilities are
available from `@nshiab/simple-data-analysis-core/helpers`.

## Quick setup

To quickly set up a data project with essential folders, configurations, and
documentation for AI agents, you can use
[@nshiab/setup-data-project](https://github.com/nshiab/setup-data-project).

```bash
npx @nshiab/setup-data-project
```

## Running a data pipeline

Transformation methods are synchronous and chainable. SDA-core queues their work
and combines compatible operations into a single DuckDB statement. Async methods
such as `getData()`, `log()`, and `writeData()` execute pending work before
returning results, so only the final method in a chain needs to be awaited.

```ts
await table.filter("salary > 50000").selectColumns(["name", "salary"]).log();
```

Use `await table.run()` or `await sdb.run()` to execute pending work without
reading or exporting a result. Both execute queued operations across all tables
in the database, in the order the methods were called.

## Performance benchmarks

These are end-to-end workflow comparisons.

These benchmarks compare SDA-core with raw DuckDB and popular Python and R
libraries, measuring duration and peak memory.

They were run on a MacBook Pro with an Apple M4 Max and 64 GB of memory.
JavaScript implementations run on Node.js. Run `npm run benchmark` to regenerate
all benchmark tables sequentially on macOS with Node.js, Python, and R installed and the input files
available locally. The AHCCD file may also be placed in `test/data/files/`.

Each implementation runs once to warm up, then three times in fresh processes.
Duration includes process startup, loading, computation, and file output; memory
is whole-process peak RSS. Warm-up outputs are checked against raw DuckDB,
including every cleaned tabular row, and every measured result is checked again.
Tables show mean duration with population standard deviation and mean peak
memory. Raw measurements are retained in `benchmarks/.work/observations.csv`.

<!-- benchmark-results:start -->

**Tabular versions:** @duckdb/node-api 1.5.6-r.1; DuckDB v1.5.6 (Node.js 24.21.0); SDA-core 2.1.13 (Node.js 24.21.0); pandas 3.0.5 (Python 3.14.7); tidyverse 2.0.0 (R 4.6.1).

**Spatial versions:** @duckdb/node-api 1.5.6-r.1; DuckDB v1.5.6 (Node.js 24.21.0); SDA-core 2.1.13 (Node.js 24.21.0); GeoPandas 1.1.4 (Python 3.14.7); sf 1.1.2 (R 4.6.1).

### Tabular workload

Using 22,051,025 temperature records (`ahccd.csv`, 1.77 GB, in
`benchmarks/data/`), we remove missing temperatures, convert dates and numbers,
save the cleaned data, then calculate average temperatures by station and decade
and export the sorted results.

| Library   |  Mean duration | Duration difference | Mean peak memory | Memory difference |
| --------- | -------------: | ------------------: | ---------------: | ----------------: |
| DuckDB    |  1.16 ± 0.02 s |              -12.8% |        2,430 MiB |             -1.1% |
| SDA-core  |  1.33 ± 0.01 s |            baseline |        2,457 MiB |          baseline |
| pandas    | 27.98 ± 0.04 s |            +2002.1% |        4,699 MiB |            +91.2% |
| tidyverse | 78.60 ± 0.46 s |            +5804.3% |        8,178 MiB |           +232.8% |

### Spatial workload

Using 335,024 Montreal public trees (`arbres-publics.csv`, 135.5 MB) and 91
neighbourhood boundaries (`quartierreferencehabitation.geojson`, 1.14 MB), both
in `benchmarks/data/`, we remove missing coordinates, create points, join trees
to neighbourhoods, then count trees per neighbourhood and export the sorted
results.

| Library   | Mean duration | Duration difference | Mean peak memory | Memory difference |
| --------- | ------------: | ------------------: | ---------------: | ----------------: |
| DuckDB    | 0.72 ± 0.01 s |              -11.8% |          285 MiB |             -9.9% |
| SDA-core  | 0.81 ± 0.00 s |            baseline |          316 MiB |          baseline |
| GeoPandas | 1.11 ± 0.00 s |              +36.3% |          292 MiB |             -7.7% |
| sf        | 1.58 ± 0.01 s |              +94.4% |          489 MiB |            +54.8% |

<!-- benchmark-results:end -->

### Focused operation benchmarks

These additional benchmarks compare Core and DuckDB on data transfer, joins,
aggregations, and JavaScript geometry updates to help track and improve
performance over time. Run `npm run benchmark` to regenerate these
tables. See the [benchmark methodology](https://github.com/nshiab/simple-data-analysis-core/blob/main/benchmarks/operations/README.md) for
fixture sizes, validation, and measurement details. Peak process memory includes
setup, warm-up, the measured operation, and validation.

<!-- benchmark-operations:start -->

#### Join followed by aggregation

| Operation        |      Rows | Batch size | Implementation | Mean duration ± SD | Mean peak process memory |
| ---------------- | --------: | ---------: | -------------- | -----------------: | -----------------------: |
| Join → aggregate | 1,000,000 |          — | Core           |    11.54 ± 0.03 ms |                174.4 MiB |
| Join → aggregate | 1,000,000 |          — | DuckDB         |    10.59 ± 0.06 ms |                168.0 MiB |

#### JavaScript data transfer

`loadArray()` measures JavaScript → DuckDB; `getData()` measures DuckDB →
JavaScript. `updateWithJS()` measures the round trip with a simple numeric
increment, including Core's staging and table replacement.

| Operation      |    Rows | Batch size | Implementation | Mean duration ± SD | Mean peak process memory |
| -------------- | ------: | ---------: | -------------- | -----------------: | -----------------------: |
| loadArray()    | 100,000 |          — | Core           |     8.63 ± 0.04 ms |                355.8 MiB |
| loadArray()    | 100,000 |          — | DuckDB         |    16.28 ± 0.16 ms |                282.4 MiB |
| getData()      | 100,000 |          — | Core           |    10.14 ± 0.04 ms |                302.2 MiB |
| getData()      | 100,000 |          — | DuckDB         |    12.05 ± 0.16 ms |                289.2 MiB |
| updateWithJS() | 100,000 |       1000 | Core           |    60.85 ± 0.19 ms |                306.5 MiB |
| updateWithJS() | 100,000 |       1000 | DuckDB         |    52.77 ± 0.37 ms |                314.1 MiB |
| updateWithJS() | 100,000 |      10000 | Core           |    35.22 ± 1.31 ms |                323.8 MiB |
| updateWithJS() | 100,000 |      10000 | DuckDB         |    34.60 ± 1.68 ms |                334.7 MiB |

#### JavaScript geometry updates

Points have one position per geometry; polygons have one ring with 1,001
positions. Both implementations transfer GeoJSON through JavaScript and stage
writes. These updates add a label and shift every longitude by 0.01 degrees.
A batch size of — means all input rows at once. Attribute-only updates are
also measured and retained in the raw results; their similar timings are
omitted here to keep the table concise.

| Operation                 |    Rows | Batch size | Implementation | Mean duration ± SD | Mean peak process memory |
| ------------------------- | ------: | ---------: | -------------- | -----------------: | -----------------------: |
| Points: geometry update   | 100,000 |          — | Core           |   174.87 ± 0.50 ms |                469.9 MiB |
| Points: geometry update   | 100,000 |          — | DuckDB         |   172.13 ± 1.32 ms |                537.3 MiB |
| Points: geometry update   | 100,000 |       1000 | Core           |   245.27 ± 4.96 ms |                298.3 MiB |
| Points: geometry update   | 100,000 |       1000 | DuckDB         |   206.80 ± 1.60 ms |                272.4 MiB |
| Polygons: geometry update |   1,000 |          — | Core           |   549.70 ± 0.67 ms |               1067.7 MiB |
| Polygons: geometry update |   1,000 |          — | DuckDB         |   555.25 ± 4.17 ms |               1103.9 MiB |
| Polygons: geometry update |   1,000 |        100 | Core           |   549.62 ± 2.49 ms |                786.0 MiB |
| Polygons: geometry update |   1,000 |        100 | DuckDB         |   552.29 ± 0.43 ms |                881.3 MiB |

<!-- benchmark-operations:end -->

## Building extensions

The full
[simple-data-analysis library](https://github.com/nshiab/simple-data-analysis)
is itself an extension of SDA-core. It subclasses `SimpleTable` to add AI,
Google Sheets and charting methods, then subclasses `SimpleDB` so every table
created by the database uses that extended table class.

Follow the same pattern when building an extension. To make new table methods
chainable, define them on a `SimpleTable` subclass, give them a return type of
`this` and return `this` after queuing their work. Then extend
`SimpleDB<YourTable>` and set its `tableClass` to your subclass. Methods that
create tables should always use `this.sdb.newTable()` so they also return your
extended table type.

Builders return `this` synchronously; their queued work runs when an observer
such as `getData()`, `log()`, or `run()` is called. Observers execute pending
work across the database in program order.

```ts
import { SimpleDB as CoreDB, SimpleTable as CoreTable } from "@nshiab/simple-data-analysis-core";

class MyTable extends CoreTable {
  selectForPublication(columns: string[]): this {
    this.selectColumns(columns);
    return this;
  }
}

class MyDB extends CoreDB<MyTable> {
  constructor() {
    super();
    this.tableClass = MyTable;
  }
}

const sdb = new MyDB();
await sdb
  .newTable("articles")
  .loadData("articles.csv")
  .selectForPublication(["title", "author"])
  .log();
```

If an extension must perform asynchronous work before queuing table builders,
use `queueAsyncBarrier()`. The callback runs at the barrier's position in
database-wide program order, and builders it queues run before later chained
operations:

```ts
import { queueAsyncBarrier } from "@nshiab/simple-data-analysis-core/helpers";

class RemoteTable extends CoreTable {
  loadRemote(url: string): this {
    queueAsyncBarrier(this, {
      method: "loadRemote()",
      parameters: { url },
      execute: async () => {
        const rows = (await fetch(url).then((response) => response.json())) as {
          [key: string]: unknown;
        }[];
        this.loadArray(rows);
      },
    });
    return this;
  }
}
```

The callback must await all asynchronous work that can queue builders. If it
rejects, captured builders that have not already run are discarded. Builders
already drained by an observer inside the callback remain applied;
`queueAsyncBarrier()` does not provide database rollback.

This differs from a failure while executing queued builders: during replay, the
failing table's remaining chain is aborted, but unexecuted work for other tables
is requeued for their next observation.

Other useful helpers, imported from `@nshiab/simple-data-analysis-core/helpers`:

- `updateColumnsWithJS()`: enrich selected columns asynchronously in bounded
  batches inside `queueAsyncBarrier()`, preserving untouched columns, including
  geometry. Return one result per input row, in the same order.
- `queryDB()` with `mergeOptions()`: execute SQL with the library's logging and
  diagnostic settings. Queries flush queued work before running.
- `quoteIdentifier()`: quote table and column names safely when constructing
  SQL.

See the [exported helpers](https://nshiab.github.io/simple-data-analysis-core/) for the complete list and links
to their documentation and examples. Helpers outside that list are internal.
