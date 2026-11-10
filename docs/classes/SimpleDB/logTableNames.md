[**Simple Data Analysis Core v2.1.23**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleDB](../SimpleDB.md) / logTableNames

# Method: logTableNames()

> **logTableNames**(): `Promise`\<[`SimpleDB`](../SimpleDB.md)\<`Table`\>\>

Defined in: src/class/SimpleDB.ts:740

Logs the names of all tables in the database to the console, sorted alphabetically.

## Returns

`Promise`\<[`SimpleDB`](../SimpleDB.md)\<`Table`\>\>

A promise that resolves to the database, so methods can be chained.

## Example

```ts
// Log all table names to the console
await sdb.logTableNames();
// Example output: SimpleDB - Tables:  ["employees","customers"]
```
