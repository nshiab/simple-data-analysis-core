[**Simple Data Analysis Core v2.1.16**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleTable](../SimpleTable.md) / renameTable

# Method: renameTable()

> **renameTable**(`name`): `Promise`\<[`SimpleTable`](../SimpleTable.md)\>

Defined in: [src/class/SimpleTable.ts:354](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleTable.ts#L354)

Renames the current table.
The new name must not belong to another registered table, ignoring ASCII letter case.

## Parameters

### name

`string`

The new name for the table.

## Returns

`Promise`\<[`SimpleTable`](../SimpleTable.md)\>

A promise that resolves to the renamed table.

## Example

```ts
// Rename the table to "new_employees"
await table.renameTable("new_employees");
await table.log();
```
