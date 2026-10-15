**Simple Data Analysis Core v2.1.13**

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
these workflow tables on macOS with Node.js, Python, and R installed and the input files
available locally. The AHCCD file may also be placed in `test/data/files/`.

Each implementation runs once to warm up, then three times in fresh processes.
Duration includes process startup, loading, computation, and file output; memory
is whole-process peak RSS. Warm-up outputs are checked against raw DuckDB,
including every cleaned tabular row, and every measured result is checked again.
Tables show mean duration with population standard deviation and mean peak
memory. Raw measurements are retained in `benchmarks/.work/observations.csv`.

<!-- benchmark-results:start -->

**Tabular versions:** @duckdb/node-api 1.5.6-r.1; DuckDB v1.5.6 (Node.js 24.21.0); SDA-core 2.1.12 (Node.js 24.21.0); pandas 3.0.5 (Python 3.14.7); tidyverse 2.0.0 (R 4.6.1).

**Spatial versions:** @duckdb/node-api 1.5.6-r.1; DuckDB v1.5.6 (Node.js 24.21.0); SDA-core 2.1.12 (Node.js 24.21.0); GeoPandas 1.1.4 (Python 3.14.7); sf 1.1.2 (R 4.6.1).

### Tabular workload

Using 22,051,025 temperature records (`ahccd.csv`, 1.77 GB, in
`benchmarks/data/`), we remove missing temperatures, convert dates and numbers,
save the cleaned data, then calculate average temperatures by station and decade
and export the sorted results.

| Library   |  Mean duration | Duration difference | Mean peak memory | Memory difference |
| --------- | -------------: | ------------------: | ---------------: | ----------------: |
| DuckDB    |  1.27 ± 0.03 s |              -11.1% |        2,613 MiB |             -0.9% |
| SDA-core  |  1.43 ± 0.03 s |            baseline |        2,636 MiB |          baseline |
| pandas    | 29.47 ± 0.09 s |            +1957.3% |        4,700 MiB |            +78.3% |
| tidyverse | 81.90 ± 0.25 s |            +5617.5% |        8,178 MiB |           +210.2% |

### Spatial workload

Using 335,024 Montreal public trees (`arbres-publics.csv`, 135.5 MB) and 91
neighbourhood boundaries (`quartierreferencehabitation.geojson`, 1.14 MB), both
in `benchmarks/data/`, we remove missing coordinates, create points, join trees
to neighbourhoods, then count trees per neighbourhood and export the sorted
results.

| Library   | Mean duration | Duration difference | Mean peak memory | Memory difference |
| --------- | ------------: | ------------------: | ---------------: | ----------------: |
| DuckDB    | 0.72 ± 0.01 s |              -12.7% |          285 MiB |            -10.2% |
| SDA-core  | 0.83 ± 0.02 s |            baseline |          318 MiB |          baseline |
| GeoPandas | 1.16 ± 0.01 s |              +39.4% |          293 MiB |             -7.9% |
| sf        | 1.66 ± 0.01 s |              +99.9% |          489 MiB |            +53.9% |

<!-- benchmark-results:end -->

### Focused operation benchmarks

These additional benchmarks compare Core and DuckDB on data transfer, joins,
aggregations, and JavaScript geometry updates to help track and improve
performance over time. Run `npm run benchmark-core` to regenerate these
tables. See the [benchmark methodology](https://github.com/nshiab/simple-data-analysis-core/blob/main/benchmarks/operations/README.md) for
fixture sizes, validation, and measurement details. Peak process memory includes
setup, warm-up, the measured operation, and validation.

<!-- benchmark-operations:start -->

#### Join followed by aggregation

| Operation        |      Rows | Batch size | Implementation | Mean duration ± SD | Mean peak process memory |
| ---------------- | --------: | ---------: | -------------- | -----------------: | -----------------------: |
| Join → aggregate | 1,000,000 |          — | Core           |    11.70 ± 0.14 ms |                176.3 MiB |
| Join → aggregate | 1,000,000 |          — | DuckDB         |    10.85 ± 0.17 ms |                166.8 MiB |

#### JavaScript data transfer

`loadArray()` measures JavaScript → DuckDB; `getData()` measures DuckDB →
JavaScript. `updateWithJS()` measures the round trip with a simple numeric
increment, including Core's staging and table replacement.

| Operation      |    Rows | Batch size | Implementation | Mean duration ± SD | Mean peak process memory |
| -------------- | ------: | ---------: | -------------- | -----------------: | -----------------------: |
| loadArray()    | 100,000 |          — | Core           |     9.07 ± 0.33 ms |                357.1 MiB |
| loadArray()    | 100,000 |          — | DuckDB         |    16.85 ± 0.10 ms |                284.4 MiB |
| getData()      | 100,000 |          — | Core           |    10.66 ± 0.19 ms |                303.5 MiB |
| getData()      | 100,000 |          — | DuckDB         |    12.41 ± 0.31 ms |                290.0 MiB |
| updateWithJS() | 100,000 |       1000 | Core           |    65.87 ± 2.14 ms |                309.9 MiB |
| updateWithJS() | 100,000 |       1000 | DuckDB         |    57.85 ± 2.08 ms |                308.9 MiB |
| updateWithJS() | 100,000 |      10000 | Core           |    36.18 ± 1.45 ms |                324.9 MiB |
| updateWithJS() | 100,000 |      10000 | DuckDB         |    35.57 ± 1.39 ms |                324.2 MiB |

#### JavaScript geometry updates

Points have one position per geometry; polygons have one ring with 1,001
positions. Both implementations transfer GeoJSON through JavaScript and stage
writes. These updates add a label and shift every longitude by 0.01 degrees.
A batch size of — means all input rows at once. Attribute-only updates are
also measured and retained in the raw results; their similar timings are
omitted here to keep the table concise.

| Operation                 |    Rows | Batch size | Implementation | Mean duration ± SD | Mean peak process memory |
| ------------------------- | ------: | ---------: | -------------- | -----------------: | -----------------------: |
| Points: geometry update   | 100,000 |          — | Core           |   182.98 ± 2.85 ms |                489.2 MiB |
| Points: geometry update   | 100,000 |          — | DuckDB         |   183.96 ± 5.85 ms |                529.8 MiB |
| Points: geometry update   | 100,000 |       1000 | Core           |   255.49 ± 4.22 ms |                335.0 MiB |
| Points: geometry update   | 100,000 |       1000 | DuckDB         |   222.69 ± 3.00 ms |                266.8 MiB |
| Polygons: geometry update |   1,000 |          — | Core           |   568.00 ± 2.26 ms |               1075.9 MiB |
| Polygons: geometry update |   1,000 |          — | DuckDB         |   565.33 ± 2.60 ms |               1101.4 MiB |
| Polygons: geometry update |   1,000 |        100 | Core           |   566.28 ± 1.60 ms |                855.6 MiB |
| Polygons: geometry update |   1,000 |        100 | DuckDB         |   571.56 ± 1.62 ms |                845.0 MiB |

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
