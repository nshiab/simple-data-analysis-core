[**Simple Data Analysis Core v2.1.18**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleTable](../SimpleTable.md) / getColumnCount

# Method: getColumnCount()

> **getColumnCount**(): `Promise`\<`number`\>

Defined in: [src/class/SimpleTable.ts:6924](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.18/src/class/SimpleTable.ts#L6924)

Returns the number of columns in the table.

## Returns

`Promise`\<`number`\>

A promise that resolves to a number representing the total count of columns.

## Example

```ts
// Get the number of columns in the table
const columnCount = await table.getColumnCount();
console.log(columnCount); // e.g., 3
```
