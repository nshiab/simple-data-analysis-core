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

## How it works

Since v2, the library follows one rule: **sync methods build; async methods
observe — and observing executes.**

Methods that transform tables (loads, filters, conversions, joins, geospatial
operations, etc.) are synchronous: they queue their work and return the table,
so they can be chained. Methods that produce a result (`getData()`, `log()`,
`writeData()`, etc.) are asynchronous: awaiting one executes everything queued
so far, fusing consecutive steps into a single DuckDB query when possible. On
large tables, fused transformations typically run around 3x faster than
step-by-step execution.

```ts
import { SimpleDB } from "@nshiab/simple-data-analysis-core";

const sdb = new SimpleDB();

// One await, at the observation point. Everything
// before it is fused into a single query.
const table = await sdb
  .newTable()
  .loadData("temperatures.csv")
  .selectColumns(["city", "time", "tas"])
  .removeMissing({ columns: "tas" })
  .convert({ tas: "double", time: "date" })
  .addColumn("decade", "integer", "FLOOR(YEAR(time) / 10)*10")
  .log();

await sdb.close();
```

If a chain ends with transformations and you need them executed before shutdown,
call `run()`. Otherwise, `close()` executes any remaining queued transformations
before cleaning up resources. If you are migrating from v1, see the
[migration guide](https://github.com/nshiab/simple-data-analysis-core/blob/main/MIGRATION.md).

### Building asynchronous extensions

Extensions that perform asynchronous work before queuing table builders can use
`queueAsyncBarrier()`. The callback runs at the barrier's position in
database-wide program order, and builders it queues run before later chained
operations:

```ts
import type { SimpleTable } from "@nshiab/simple-data-analysis-core";
import { queueAsyncBarrier } from "@nshiab/simple-data-analysis-core/helpers";

function loadRemote(table: SimpleTable, url: string): SimpleTable {
  queueAsyncBarrier(table, {
    method: "loadRemote()",
    parameters: { url },
    execute: async () => {
      const rows = await fetch(url).then((response) => response.json()) as {
        [key: string]: unknown;
      }[];
      table.loadArray(rows);
    },
  });
  return table;
}
```

The callback must await all asynchronous work that can queue builders. If it
rejects, captured builders that have not already run are discarded. Builders
already drained by an observer inside the callback remain applied;
`queueAsyncBarrier()` does not provide database rollback.

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
