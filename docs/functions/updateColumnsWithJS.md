[**Simple Data Analysis Core v2.1.16**](../index.md)

***

[Simple Data Analysis Core](../globals.md) / updateColumnsWithJS

# Function: updateColumnsWithJS()

> **updateColumnsWithJS**(`table`, `inputColumns`, `outputColumns`, `generate`, `options?`): `Promise`\<`void`\>

Defined in: [src/helpers/updateColumnsWithJS.ts:52](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/helpers/updateColumnsWithJS.ts#L52)

Generates columns from selected input columns, keeping other SQL values in
DuckDB. Call from an asynchronous extension barrier. The callback must return
one row per input row in the same order; only the declared output columns are
stored. Existing output columns are replaced, with types inferred from the
generated values. Generation runs sequentially in bounded batches (1,000 rows
by default); callbacks must not depend on receiving the whole table. Non-null
output types must agree across batches. All-null batches defer type inference.
Only one batch of inputs and outputs is retained by this helper in JavaScript;
callers must also bound their own buffering. Reads finish before callbacks or
writes use the shared connection. The original table is replaced only after
staging succeeds. Empty tables are unchanged and do not invoke the callback;
outputs that remain null in every batch use VARCHAR.

Untouched geometry columns remain in DuckDB, preserving their values, types
and CRS without GeoJSON conversion. Geometry columns cannot be selected as
inputs or overwritten as outputs; use updateWithJS() for editable GeoJSON.
This SQL-only preservation path accepts any source CRS.

## Parameters

### table

[`SimpleTable`](../classes/SimpleTable.md)

Table to enrich.

### inputColumns

`string`[]

Columns available to the callback.

### outputColumns

`string`[]

Generated columns to add or replace.

### generate

(`rows`) => `Promise`\<`object`[]\>

Produces one result per input row, in input order.

### options?

Controls the maximum rows read, generated, and staged at once.

#### batchSize?

`number`

Maximum rows per callback and transfer batch. Defaults to 1,000.

**Example**

```ts
{ batchSize: 500 }
```

## Returns

`Promise`\<`void`\>

Resolves after merging the generated columns into the table.

## Example

```ts
queueAsyncBarrier(table, {
  method: "label()",
  parameters: null,
  execute: () => updateColumnsWithJS(table, ["name"], ["label"], async (rows) =>
    rows.map((row) => ({ label: String(row.name).toUpperCase() })),
    { batchSize: 500 }),
});
await table.log();
```
