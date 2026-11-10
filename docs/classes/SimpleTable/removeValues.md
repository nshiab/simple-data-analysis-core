[**Simple Data Analysis Core v2.1.23**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleTable](../SimpleTable.md) / removeValues

# Method: removeValues()

> **removeValues**(`columnsAndValues`, `options?`): `this`

Defined in: src/class/SimpleTable.ts:2226

Removes rows from this table that have specific values in specified columns.
By default, a row is removed if it matches at least one specified column.

## Parameters

### columnsAndValues

\{\[`key`: `string`\]: `unknown`; \}

An object where keys are column names and values are the specific values (or an array of values) to match in those columns. Include `null` to match `NULL` values in a column.

### options?

Optional configuration for matching across columns.

#### match?

`"all"` \| `"any"`

Use `"any"` (default) to remove rows that match at least one specified column or `"all"` to remove rows that match every specified column.

## Returns

`this`

The table, so methods can be chained.

## Examples

```ts
// Remove rows where 'job' is 'accountant' or 'developer', OR 'city' is 'Montreal'
await table.removeValues({ job: ["accountant", "developer"], city: "Montreal" }).log();
```

```ts
// Remove rows where 'job' is 'accountant' or 'developer', AND 'city' is 'Montreal'
await table.removeValues({ job: ["accountant", "developer"], city: "Montreal" }, { match: "all" }).log();
```

```ts
// Remove rows where 'status' is 'inactive'
await table.removeValues({ status: "inactive" }).log();
```

```ts
// Remove rows where 'status' is NULL
await table.removeValues({ status: null }).log();
```
