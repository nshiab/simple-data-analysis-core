[**Simple Data Analysis Core v2.1.14**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleTable](../SimpleTable.md) / logTypes

# Method: logTypes()

> **logTypes**(): `Promise`\<[`SimpleTable`](../SimpleTable.md)\>

Logs the types of all columns in the table to the console.

## Returns

`Promise`\<[`SimpleTable`](../SimpleTable.md)\>

A promise that resolves to the SimpleTable instance after logging the column types.

## Example

```ts
// Log the data types of all columns in the table
await table.logTypes();
```
