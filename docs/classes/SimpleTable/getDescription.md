[**Simple Data Analysis Core v2.1.15**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleTable](../SimpleTable.md) / getDescription

# Method: getDescription()

> **getDescription**(): `Promise`\<`object`[]\>

Returns descriptive statistical information about the columns, including details like data types, number of null values, and distinct values.

## Returns

`Promise`\<`object`[]\>

A promise that resolves to an array of objects, each representing descriptive statistics for a column.

## Example

```ts
// Get and log descriptive information about the table's columns
const description = await table.getDescription();
console.table(description);
```
