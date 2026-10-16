[**Simple Data Analysis Core v2.1.16**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleTable](../SimpleTable.md) / getColumns

# Method: getColumns()

> **getColumns**(): `Promise`\<`string`[]\>

Returns a list of all column names in the table.

## Returns

`Promise`\<`string`[]\>

A promise that resolves to an array of strings, where each string is a column name.

## Example

```ts
// Get all column names from the table
const columns = await table.getColumns();
console.log(columns); // e.g., ["id", "name", "age"]
```
