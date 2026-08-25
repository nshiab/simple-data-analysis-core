# Migrating from v1 to v2

v2 changes how methods execute. In v1, every method ran its SQL immediately and
had to be awaited. In v2, the library follows one rule:

> **Sync methods build; async methods observe — and observing executes.**

- **Transformation methods are now synchronous.** Loads (`loadData`,
  `loadArray`, `loadGeoData`, ...), filters, conversions, string updates, joins,
  geospatial operations, summaries, index creation... They queue their work and
  return the table, so they can be chained.
- **Observer methods stay asynchronous.** `getData()`, `getRowCount()`,
  `hasColumn()`, `log()`, `writeData()`, `stream()`, `customQuery()`, `cache()`,
  etc. Awaiting one executes everything queued so far, then produces its result.
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
await table.log(); // executes everything, then prints
```

Methods that create an output table—through `outputTable` (`join()`,
`joinGeo()`, `summarize()`, ...) or `name` (`clone()`)—return the output table
instance synchronously, so you can keep chaining on it:

```ts
const joined = tableA
  .join(tableB, { outputTable: "joined" })
  .filter(`price > 100`);
await joined.log();
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

`sdb.close()` executes any queued transformations before it compacts file-based
databases and cleans up resources. You only need to call `run()` explicitly when
the transformations must finish before shutdown—for example, before an external
tool reads the database.

If a queued transformation fails during `close()`, cleanup still completes and
`close()` rejects with the execution error.

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

Use `logSQL: true` to log the exact fused statement immediately before it runs,
or `explainSQL: true` to log supported DuckDB query plans. Observability does
not disable fusion or change execution.

## Mutable arguments are captured

Sync builders capture mutable options, arrays, and maps when called. Later
caller mutations do not change already-queued operations, and builders do not
assign defaults or generated names into caller-owned options.

```ts
const replacements = { old: "new" };
table.replace("col", replacements);
replacements.old = "other"; // the queued replace() still uses "new"
await table.getData();
```

## Order matters for `sort()`

Order-preserving transformations retain an earlier `sort()` when fused. Joins,
grouping, aggregation, and sampling do not guarantee input order; chain the
existing `sort()` method after those operations when deterministic output order
matters.

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

## Renamed methods, parameters and options

v2 unifies method, parameter and option names across the API. Positional
parameter renames (like `values` → `column`) don't require any code change —
only the renamed methods and option keys below are breaking.

### Renamed methods

| v1                        | v2                     | Why                                                                         |
| :------------------------ | :--------------------- | :-------------------------------------------------------------------------- |
| `keep()`                  | `keepValues()`         | Says it filters rows by value maps, distinct from `filter()`'s conditions.  |
| `remove()`                | `removeValues()`       | Same, and no longer blends into the `remove*` family (`removeRows()`, ...). |
| `left()`                  | `firstChars()`         | "Left/right" read as join sides in a join-heavy API.                        |
| `right()`                 | `lastChars()`          | Same.                                                                       |
| `points()`                | `createPoints()`       | Makes the point-construction operation explicit.                            |
| `latLon()`                | `extractLatLon()`      | Makes it clear that coordinates are extracted into new columns.             |
| `concatenateRow()`        | `rowToText()`          | It doesn't concatenate rows — it turns each row into a labeled text block.  |
| `loadDataFromDirectory()` | `loadDirectory()`      | Shorter; "data from" added nothing.                                         |
| `proportionsHorizontal()` | `rowProportions()`     | Shorter and names the unit instead of a visual direction.                   |
| `proportionsVertical()`   | `columnProportions()`  | Same.                                                                       |
| `logTable()`              | `log()`                | The table receiver already supplies the noun.                               |
| `cloneTable()`            | `clone()`              | The table receiver already supplies the noun.                               |
| `done()`                  | `close()`              | Uses the conventional lifecycle verb.                                       |
| `getTableName()`          | `getName()`            | Matches the existing `table.name` property.                                 |
| `getNbRows()`             | `getRowCount()`        | Uses the same `*Count` vocabulary as options and output columns.            |
| `getNbColumns()`          | `getColumnCount()`     | Same.                                                                       |
| `getNbValues()`           | `getValueCount()`      | Same.                                                                       |
| `getNbCharacters()`       | `getCharacterCount()`  | Same.                                                                       |
| `logNbRows()`             | `logRowCount()`        | Same.                                                                       |
| `isValidGeo()`            | `addGeoValidity()`     | Makes it clear that the method adds a column.                               |
| `isClosedGeo()`           | `addGeoClosedStatus()` | Makes it clear that the method adds a column.                               |
| `typeGeo()`               | `addGeoType()`         | Makes it clear that the method adds a column.                               |
| `nbVertices()`            | `addVertexCount()`     | Names both the mutation and the value being added.                          |

`SimpleTable.name` remains available for reading, but assigning to it directly
is no longer supported. Use `renameTable()` so the database and the table
instance stay synchronized. `SimpleDB.getTables()` now returns a read-only
snapshot of the table registry; direct registry mutation through `tables` or
`pushTable()` is no longer supported.

### One `strict` option instead of five names

Methods that could skip validations or error-throwing now all use
`strict: false` (validations are on by default):

| Method            | v1                        | v2                  |
| :---------------- | :------------------------ | :------------------ |
| `getRow()`        | `{ noCheck: true }`       | `{ strict: false }` |
| `splitSpread()`   | `{ noCheck: true }`       | `{ strict: false }` |
| `renameColumns()` | `{ checkColumns: false }` | `{ strict: false }` |
| `convert()`       | `{ try: true }`           | `{ strict: false }` |
| `randomPoint()`   | `{ try: true }`           | `{ strict: false }` |

### Renamed option keys

| Method                           | v1                                                | v2                                       |
| :------------------------------- | :------------------------------------------------ | :--------------------------------------- |
| `join()`                         | `{ commonColumn: "id" }`                          | `{ on: "id" }`                           |
| `loadData()` / `loadDirectory()` | `{ fileName: true }`                              | `{ filename: true }`                     |
| `loadGeoData()`                  | `{ toWGS84: true }`                               | `{ toEPSG4326: true }`                   |
| `joinGeo()`                      | `joinGeo(tableB, "within", ...)`                  | `joinGeo(tableB, "withinDistance", ...)` |
| `clone()`                        | `{ outputTable: "copy" }`                         | `{ name: "copy" }`                       |
| `summarize()`                    | `{ toMs: true }`                                  | `{ datesToMs: true }`                    |
| `ranks()`                        | `{ noGaps: true }`                                | `{ dense: true }`                        |
| `writeDB()`                      | `{ noMetaData: true }`                            | `{ metadata: false }`                    |
| `trim()`                         | `{ method: "leftTrim" \| "rightTrim" \| "trim" }` | `{ side: "left" \| "right" \| "both" }`  |
| `pad()`                          | `{ method: "left", char: "0" }`                   | `{ side: "left", character: "0" }`       |
| `fuzzyClean()`                   | `{ keep: "mostCommon" }`                          | `{ strategy: "mostCommon" }`             |
| `joinGeo()`                      | `{ leftTableColumn, rightTableColumn }`           | `{ leftColumn, rightColumn }`            |
| `customQuery()`                  | `{ returnDataFrom: "query" }`                     | `{ returnData: true }`                   |
| `new SimpleDB()` / `newTable()`  | `{ types: true }`                                 | `{ typesToLog: true }`                   |
| `new SimpleDB()` / `newTable()`  | `{ nbRowsToLog: 20 }`                             | `{ rowsToLog: 20 }`                      |
| `log()`                          | `{ nbRowsToLog: 20 }`                             | `{ count: 20 }`                          |
| `new SimpleDB()` / `newTable()`  | `{ nbCharactersToLog: 50 }`                       | `{ charsToLog: 50 }`                     |
| `new SimpleDB()`                 | `{ tempDirectory: "./tmp" }`                      | `{ tempDir: "./tmp" }`                   |
| `clone()`                        | `{ nbRows: 10 }`                                  | `{ limit: 10 }`                          |
| Methods that group or partition  | `{ categories: "region" }`                        | `{ by: "region" }`                       |
| `summarize()`                    | `{ values: "sales" }`                             | `{ columns: "sales" }`                   |
| `summarize()`                    | `{ summaries: ["mean", "sum"] }`                  | `{ stats: ["mean", "sum"] }`             |
| `wider()`                        | `{ aggregation: "max" }`                          | `{ stat: "max" }`                        |

The `categories` → `by` rename applies to `cloneColumnWithOffset()`, `fill()`,
`addRowNumber()`, `nest()`, `ranks()`, `quantiles()`, `columnProportions()`,
`summarize()`, `accumulate()`, `rolling()`, `correlations()`,
`linearRegressions()`, `outliersIQR()`, `zScore()`, `normalize()`, and
`aggregateGeo()`.

Statistic names are standardized too:

| v1                | v2              |
| :---------------- | :-------------- |
| `countUnique`     | `countDistinct` |
| `var`             | `variance`      |
| `wider()`'s `avg` | `mean`          |

In `addSummaryRows()`, statistics now belong to the third `options` parameter,
and custom row configurations use `{ stat: "sum", label: "Total" }` instead of a
`summary` property. For example, use
`{ stats: ["sum", { stat: "mean", label: "Average" }] }`. In `rolling()`, the
statistic parameter is now called `stat`.

### `summarize()`: the `column` output column is now automatic

The `column` output column identifies which input column each row summarizes, so
it only carries information when more than one column is summarized.
`summarize()` now adds it exactly in that case: summarizing several columns
produces a `column` column, summarizing a single column (or none) does not. The
v1 `noColumnValue` option is gone — there is nothing left to configure.

```ts
table.summarize({ columns: "salary" }); // no `column` output column
table.summarize({ columns: ["salary", "age"] }); // `column` output column
```

If you summarized a single column in v1 without `noColumnValue: true`, the
output loses its constant `value` column in v2. Multi-column output renames that
discriminator from `value` to `column`.

### `join()`: right and full joins keep their join keys

In v1, the join columns of a right or full join came from the left table, so
rows existing only in the right table had `null` join keys. In v2, the join keys
are always populated: a right join takes them from the right table, and a full
join takes them from whichever side matched.

```ts
// v1: { dishId: null, name: null, category: "Soup" }
// v2: { dishId: 8, name: null, category: "Soup" }
dishes.join(categories, { on: "dishId", type: "right" });
```

### `null` instead of `undefined` for missing rows

`getRow()` (with `strict: false`), `getFirstRow()` and `getLastRow()` now return
`null` when no row matches, consistent with how the library represents missing
values everywhere else (SQL `NULL` cells, `customQuery()`). In v1 they returned
`undefined` — and `getLastRow()` threw a `TypeError` on an empty result.

### Renamed methods

Several methods have clearer names in v2:

- `removeIntersection()` → `difference()`
- `intersect()` → `intersects()`
- `inside()` → `coveredBy()`
- `boundingBox()` → `addBoundingBox()`
- `getVar()` → `getVariance()`

### Renamed positional parameters

These don't break any calls (arguments are positional), but documentation and
editor hints now use the new names:

- `sample(quantity)` → `sample(count)`; `skip(nbRowsToSkip)` → `skip(count)`
- `firstChars()` / `lastChars()` (formerly `left()` / `right()`):
  `numberOfCharacters` → `count`
- `bm25()`: `nbResults` → `count`; `quantiles()`: `nbQuantiles` → `count`
- `ranks()`, `quantiles()`, `bins()`: `values` → `column`
- `replace()`: `strings` → `replacements`
- `reproject(to)` → `reproject(crs)`
- `cloneColumn()` and `cloneColumnWithOffset()`: `originalColumn` → `column`
- `randomPoint()`: `nbPointsToTry` → `tries`
- `createFtsIndex()` and `bm25()`: `columnId`, `columnText` → `idColumn`,
  `textColumn`
- `createPoints()` and `extractLatLon()`: `columnLat`, `columnLon` →
  `latColumn`, `lonColumn`
- `longer()`: `columnsTo` → `namesTo`; `wider()`: `columnsFrom` → `namesFrom`
- `coveredBy()` (formerly `inside()`): `column1`, `column2` → `column`,
  `containerColumn`
- `loadArray(arrayOfObjects)` → `loadArray(rows)`;
  `insertTables(tablesToInsert)` → `insertTables(tables)`; `cache(run)` →
  `cache(compute)`

## Performance tips

- The more consecutive transformations you queue, the fewer queries run. A
  method with data-dependent logic (`bins()`, `pad()`, `fill()`, joins, index
  creation, ...) executes between fused segments, so group simple
  transformations together when order allows it.
- Geospatial transformations fuse too: the spatial extension is loaded once per
  database, not once per method.
