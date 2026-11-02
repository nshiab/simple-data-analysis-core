[**Simple Data Analysis Core v2.1.18**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleTable](../SimpleTable.md) / logUniques

# Method: logUniques()

> **logUniques**(`column`, `options?`): `Promise`\<[`SimpleTable`](../SimpleTable.md)\>

Defined in: [src/class/SimpleTable.ts:9187](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.18/src/class/SimpleTable.ts#L9187)

Logs sorted unique values or combinations without modifying the table.
A column name logs an array of values, which may be truncated by your runtime
(typically after 100 values). An array of column names logs all unique combinations
as a table, sorted in ascending order by those columns in the order provided.
Table cells use the table's `charsToLog` setting.
You can optionally stringify the results to log them as complete formatted JSON.

## Parameters

### column

`string` \| `string`[]

A column name, or a non-empty array of column names whose unique combinations will be logged. Repeated column names are included only once.

### options?

An optional object with configuration options:

#### stringify?

`boolean`

If `true`, converts the unique values or combinations to a JSON string before logging. Defaults to `false`.

## Returns

`Promise`\<[`SimpleTable`](../SimpleTable.md)\>

A promise that resolves to the SimpleTable instance after logging the unique values or combinations.

## Examples

```ts
// Logs unique values for the column "name"
await table.logUniques("name");
```

```ts
// Logs unique values for the column "name" and stringifies them
await table.logUniques("name", { stringify: true });
```

```ts
// Log unique combinations of start and end years as a table
await table.logUniques(["yearStart", "yearEnd"]);
```

```ts
// Log unique combinations as complete formatted JSON
await table.logUniques(["yearStart", "yearEnd"], { stringify: true });
```
