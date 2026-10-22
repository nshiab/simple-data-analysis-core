[**Simple Data Analysis Core v2.1.16**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleDB](../SimpleDB.md) / getTableNames

# Method: getTableNames()

> **getTableNames**(): `Promise`\<`string`[]\>

Defined in: [src/class/SimpleDB.ts:723](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L723)

Returns an array of all table names in the database, sorted alphabetically.

## Returns

`Promise`\<`string`[]\>

A promise that resolves to an array of table names.

## Example

```ts
// Get all table names
const tableNames = await sdb.getTableNames();
console.log(tableNames); // Output: ["employees", "customers"]
```
