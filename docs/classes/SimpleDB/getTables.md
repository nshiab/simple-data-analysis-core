[**Simple Data Analysis Core v2.1.16**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleDB](../SimpleDB.md) / getTables

# Method: getTables()

> **getTables**(): readonly `Table`[]

Defined in: [src/class/SimpleDB.ts:765](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.16/src/class/SimpleDB.ts#L765)

Returns an array of all SimpleTable instances in the database.

The returned array is a snapshot and cannot mutate the database's internal
table registry.

## Returns

readonly `Table`[]

A read-only array of SimpleTable instances.

## Example

```ts
// Get all SimpleTable instances
const tables = sdb.getTables();
```
