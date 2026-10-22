[**Simple Data Analysis Core v2.1.17**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleDB](../SimpleDB.md) / newTable

# Method: newTable()

> **newTable**(`name?`): `Table`

Defined in: [src/class/SimpleDB.ts:574](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.17/src/class/SimpleDB.ts#L574)

Creates a new SimpleTable instance within the database.
The name must be unique among registered tables, ignoring ASCII letter case.

## Parameters

### name?

`string`

The name of the new table. If not provided, a default name is generated (e.g., "table1").

## Returns

`Table`

A new table instance.

## Examples

```ts
// Create a table with a default name (e.g., "table1", "table2", etc.)
const dataTable = await sdb
  .newTable()
  .loadArray([{ value: 1 }])
  .log();
```

```ts
// Create a table with a specific name
const employees = await sdb
  .newTable("employees")
  .loadData("employees.csv")
  .log();
```
