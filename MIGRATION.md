# Migrating from v1 to v2

v2 changes how methods execute. In v1, every method ran its SQL immediately and
had to be awaited. In v2, the library follows one rule:

> **Sync methods build; async methods observe — and observing executes.**

- **Transformation methods are now synchronous.** Loads (`loadData`,
  `loadArray`, `loadGeoData`, ...), filters, conversions, string updates, joins,
  geospatial operations, summaries, index creation... They queue their work and
  return the table, so they can be chained.
- **Observer methods stay asynchronous.** `getData()`, `getNbRows()`,
  `hasColumn()`, `logTable()`, `writeData()`, `stream()`, `customQuery()`,
  `cache()`, etc. Awaiting one executes everything queued so far, then produces
  its result.
- At execution time, consecutive transformations are **fused into a single
  DuckDB query** when possible. On large tables, fused transformations typically
  run around 3x faster than v1's step-by-step execution.

## What you need to change

Mostly nothing: `await` on a synchronous method is a harmless no-op in
JavaScript, so v1-style code keeps working. To adopt the v2 style, delete the
`await`s in front of transformations (your editor will flag them) and chain:

```ts
// v1
await table.loadData("temperatures.csv");
await table.selectColumns(["city", "time", "tas"]);
await table.removeMissing({ columns: "tas" });
await table.convert({ tas: "double", time: "date" });
const data = await table.getData();

// v2 (chained)
const data = await table
  .loadData("temperatures.csv")
  .selectColumns(["city", "time", "tas"])
  .removeMissing({ columns: "tas" })
  .convert({ tas: "double", time: "date" })
  .getData();

// v2 (statement style works too — methods queue on the same table)
table.loadData("temperatures.csv");
table.convert({ tas: "double", time: "date" });
await table.logTable(); // executes everything, then prints
```

Methods with an `outputTable` option (`join()`, `joinGeo()`, `cloneTable()`,
`summarize()`, ...) return the output table instance synchronously, so you can
keep chaining on it:

```ts
const joined = tableA
  .join(tableB, { outputTable: "joined" })
  .filter(`price > 100`);
await joined.logTable();
```

## `run()`: executing without observing

If a chain ends with transformations and nothing observes it — for timing, or to
materialize a table before an external tool reads the database — call `run()`:

```ts
await table
  .loadData("data.csv")
  .convert({ price: "number" })
  .run();
```

`sdb.done()` warns if a table still has queued methods that never executed (the
forgotten-`run()` safety net). For **in-memory** databases the queued work is
dropped: nobody could ever observe it. For **file-based** databases, `done()`
persists the data, so it executes the queued work like any other observer.

## Errors surface at the observation point

Validations that need the database (a `convert()` on a missing column, for
example) no longer throw at the call, but when the chain executes:

```ts
table.convert({ nonExistentColumn: "number" }); // does not throw here
await table.getData(); // throws here
```

When a fused query fails, the engine re-runs the segment step by step to
pinpoint the culprit and reports it exactly as v1 would have (an `SDAError`
carrying the method name, its parameters and the failing query). Validations
that don't need the database (invalid options, empty arrays, ...) still throw at
the call.

To debug, pass `debug: true` to `SimpleDB`: fusion is disabled and every method
executes immediately, step by step, with the same logging as v1.

## Don't mutate arguments after passing them

Because a sync builder reads its arguments when the chain executes, not when you
call it, treat any object or array you pass to a builder as owned by the library
from that point on. Mutating and reusing the same object before the next
observer runs would change the already-queued operation:

```ts
const replacements = { old: "new" };
table.replace("col", replacements);
replacements.old = "other"; // don't: the queued replace() would use "other"
await table.getData();
```

Pass a fresh object per call instead. (This only affects mutable arguments;
strings, numbers and booleans are unaffected.)

## Order matters for `sort()`

Methods queued after a `sort()` are fused with it into a single query and may
not preserve its row order. Call `sort()` last in a chain of transformations.

## Cross-table operations

Queued operations execute in the order you called them, even across tables. A
join sees the other table exactly as it was when you called the join:

```ts
tableB.filter(`year > 2000`);
tableA.join(tableB); // will see tableB with the filter above...
tableB.filter(`country === 'Canada'`); // ...but not this one
await tableA.getData();
```

## Exceptions: methods that stay async

- **`renameTable()` and `removeTable()`** change the table's identity, so they
  execute immediately (after running any queued methods).
- **`updateWithJS()`** runs your JavaScript function on the data, so it executes
  immediately: your function runs when you await the call, not at a later
  observation point.
- **`cache()`** must read the cache to decide between running your function and
  restoring cached data.

## Performance tips

- The more consecutive transformations you queue, the fewer queries run. A
  method with data-dependent logic (`bins()`, `pad()`, `fill()`, joins, index
  creation, ...) executes between fused segments, so group simple
  transformations together when order allows it.
- Geospatial transformations fuse too: the spatial extension is loaded once per
  database, not once per method.
