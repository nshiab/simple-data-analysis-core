[**Simple Data Analysis Core v2.1.16**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleDB](../SimpleDB.md) / getTable

# Method: getTable()

> **getTable**(`name`): `Promise`\<`Table`\>

Defined in: [src/class/SimpleDB.ts:623](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L623)

Retrieves an existing SimpleTable instance from the database.

## Parameters

### name

`string`

The name of the table to retrieve.

## Returns

`Promise`\<`Table`\>

A promise that resolves to the SimpleTable instance if found.

## Example

```ts
// Retrieve the "employees" table
const employees = await sdb.getTable("employees");
await employees.log();
```
