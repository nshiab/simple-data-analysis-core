[**Simple Data Analysis Core v2.1.14**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleDB](../SimpleDB.md) / getTableNames

# Method: getTableNames()

> **getTableNames**(): `Promise`\<`string`[]\>

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
