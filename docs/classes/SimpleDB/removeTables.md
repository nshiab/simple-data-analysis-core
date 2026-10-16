[**Simple Data Analysis Core v2.1.15**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleDB](../SimpleDB.md) / removeTables

# Method: removeTables()

> **removeTables**(`tables`): `Promise`\<[`SimpleDB`](../SimpleDB.md)\<`Table`\>\>

Removes one or more tables from the database.

## Parameters

### tables

`string` \| `Table` \| (`string` \| `Table`)[]

A single table or an array of tables to remove, specified by name or as SimpleTable instances. Pass `"all"` to remove all tables.

## Returns

`Promise`\<[`SimpleDB`](../SimpleDB.md)\<`Table`\>\>

A promise that resolves to the database, so methods can be chained.

## Examples

```ts
// Remove a single table by name
await sdb.removeTables("employees");
```

```ts
// Remove multiple tables by name
await sdb.removeTables(["customers", "products"]);
```

```ts
// Remove a single table using a SimpleTable instance
const employeesTable = sdb.newTable("employees");
// ... load data ...
await sdb.removeTables(employeesTable);
```

```ts
// Remove all tables
await sdb.removeTables("all");
```
