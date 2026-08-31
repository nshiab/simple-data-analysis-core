# Simple data analysis core (SDA-core)

This repository contains the core functionalities of the
[simple-data-analysis library](https://github.com/nshiab/simple-data-analysis),
an easy-to-use and high-performance TypeScript library for data analysis that
you can use with tabular, geospatial and vector data.

You'll find here a stripped-out version with only one dependency (DuckDB) that
is aimed to be light-weight and to be used in constrained environment.

The library is available on
[JSR](https://jsr.io/@nshiab/simple-data-analysis-core) with its
[documentation](https://jsr.io/@nshiab/simple-data-analysis-core/doc).

The documentation is also available as the markdown file
[llm.md](https://github.com/nshiab/simple-data-analysis-core/blob/main/llm.md),
which can be passed as context to improve the use of the library by AI coding
assistants or agents.

The library is maintained by [Nael Shiab](http://naelshiab.com/), computational
journalist and senior data producer for [CBC News](https://www.cbc.ca/news).

For the full-fledged library (with AI, dataviz, google sheet methods and more),
check the
[simple-data-analysis repository](https://github.com/nshiab/simple-data-analysis).

> [!TIP]
> To learn how to use SDA, check out
> [Code Like a Journalist](https://www.code-like-a-journalist.com/), a free and
> open-source data analysis and data visualization course in TypeScript.

## Installation

The library is available on
[JSR](https://jsr.io/@nshiab/simple-data-analysis-core) and
[NPM](https://www.npmjs.com/package/@nshiab/simple-data-analysis-core).

```bash
# Deno
deno add jsr:@nshiab/simple-data-analysis-core

# Node.js
npm i @nshiab/simple-data-analysis-core

# Bun
bun add @nshiab/simple-data-analysis-core
```

## Quick setup

To quickly set up a data project with essential folders, configurations, and
documentation for AI agents, you can use
[@nshiab/setup-data-project](https://github.com/nshiab/setup-data-project).

```bash
# Deno
deno run -A jsr:@nshiab/setup-data-project

# Node
npx @nshiab/setup-data-project

# Bun
bunx @nshiab/setup-data-project
```

## Database files in version 2

`new SimpleDB()` works in memory. To work directly in a DuckDB file, pass
`{ file: "./analysis.duckdb" }`: SDA opens an existing file or creates a new one
on first use. Await `getTable()` to access a saved table, or `start()` to
restore all saved table handles before using the synchronous `getTables()`
method. `{ readOnly: true }` opens an existing file without allowing changes.

```ts
const sdb = new SimpleDB({ file: "./analysis.duckdb" });
const observations = await sdb.getTable("observations");
await observations.filter("value IS NOT NULL").log();
await sdb.close();
```

`loadDB(file)` imports a copy into the current database, including into a
persistent database. It opens the source read-only, rejects existing table-name
conflicts, and rolls back failed copies. `writeDB(file)` exports a snapshot
after executing pending work; subsequent changes still affect the working
database.

When migrating from the previous interface:

- Replace `loadDB(file, { detach: false })` with `new SimpleDB({ file })` for
  DuckDB files. The `detach` and `name` import options have been removed. SQLite
  files are supported for import/export, not as the persistent working database.
- The constructor now opens existing files by default. Explicit
  `overwrite: true` still replaces a file on first use.
- Existing export destinations require `writeDB(file, { overwrite: true })`.
  Exports finish in a temporary file before publishing the output. Open database
  files attached to that instance, symbolic links, and directories cannot be
  replaced.
- DuckDB files support both `.db` and `.duckdb` extensions. SDA index
  definitions are stored inside the reserved `__sda` schema. Writable persistent
  databases save metadata on `close()`.
- SQLite exports contain main-schema tables and views materialized as tables.
  They do not preserve DuckDB schemas, indexes, constraints, or SDA metadata.
  SQLite conversion may lose type information; unsupported conversions fail
  without replacing the destination.
- `close()` executes pending work, saves metadata, and releases resources. It no
  longer compacts or replaces persistent database files.

## Performance benchmarks

These benchmarks compare SDA-core with raw DuckDB and popular Python and R
libraries, measuring duration and peak memory.

<!-- benchmark-results:start -->

### Tabular workload

Using 22,051,025 temperature records (`ahccd.csv`, 1.77 GB, in
`benchmarks/data/`), we remove missing temperatures, convert dates and numbers,
save the cleaned data, then calculate average temperatures by station and decade
and export the sorted results.

| Library version                           | Runtime       |  Mean duration | Duration difference | Mean peak memory | Memory difference |
| ----------------------------------------- | ------------- | -------------: | ------------------: | ---------------: | ----------------: |
| @duckdb/node-api 1.5.5-r.4; DuckDB v1.5.5 | Deno 2.9.6    |  1.20 ± 0.04 s |               -7.4% |         2,457 MB |             +3.7% |
| SDA-core 2.0.0-rc.18                      | Deno 2.9.6    |  1.29 ± 0.01 s |            baseline |         2,370 MB |          baseline |
| pandas 3.0.5                              | Python 3.14.7 | 28.09 ± 0.05 s |            +2075.9% |         4,699 MB |            +98.3% |
| tidyverse 2.0.0                           | R 4.6.1       | 78.64 ± 0.34 s |            +5990.6% |         8,178 MB |           +245.1% |

### Spatial workload

Using 335,024 Montreal public trees (`arbres-publics.csv`, 135.5 MB) and 91
neighbourhood boundaries (`quartierreferencehabitation.geojson`, 1.14 MB), both
in `benchmarks/data/`, we remove missing coordinates, create points, join trees
to neighbourhoods, then count trees per neighbourhood and export the sorted
results.

| Library version                           | Runtime       | Mean duration | Duration difference | Mean peak memory | Memory difference |
| ----------------------------------------- | ------------- | ------------: | ------------------: | ---------------: | ----------------: |
| @duckdb/node-api 1.5.5-r.4; DuckDB v1.5.5 | Deno 2.9.6    | 0.76 ± 0.01 s |               -5.1% |           255 MB |             -7.2% |
| SDA-core 2.0.0-rc.18                      | Deno 2.9.6    | 0.80 ± 0.01 s |            baseline |           274 MB |          baseline |
| GeoPandas 1.1.4                           | Python 3.14.7 | 1.15 ± 0.00 s |              +44.3% |           292 MB |             +6.6% |
| sf 1.1.2                                  | R 4.6.1       | 1.66 ± 0.01 s |             +107.8% |           490 MB |            +78.9% |

<!-- benchmark-results:end -->

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

```ts
import {
  SimpleDB as CoreDB,
  SimpleTable as CoreTable,
} from "@nshiab/simple-data-analysis-core";

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
        const rows = await fetch(url).then((response) => response.json()) as {
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
