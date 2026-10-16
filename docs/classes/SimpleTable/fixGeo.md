[**Simple Data Analysis Core v2.1.15**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleTable](../SimpleTable.md) / fixGeo

# Method: fixGeo()

> **fixGeo**(`column?`): `this`

Attempts to make invalid geometries valid without removing any vertices.

## Parameters

### column?

`string`

The name of the column storing the geometries to be fixed. If omitted, the method will automatically attempt to find a geometry column.

## Returns

`this`

The table, so methods can be chained.

## Examples

```ts
// Fix invalid geometries in the default geometry column
await table.fixGeo().log();
```

```ts
// Fix invalid geometries in a specific column named 'myGeom'
await table.fixGeo("myGeom").log();
```
