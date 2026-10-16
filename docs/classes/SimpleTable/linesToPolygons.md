[**Simple Data Analysis Core v2.1.14**](../../index.md)

***

[Simple Data Analysis Core](../../globals.md) / [SimpleTable](../SimpleTable.md) / linesToPolygons

# Method: linesToPolygons()

> **linesToPolygons**(`column?`): `this`

Transforms closed linestring geometries into polygon geometries.

## Parameters

### column?

`string`

The name of the column storing the linestring geometries. If omitted, the method will automatically attempt to find a geometry column.

## Returns

`this`

The table, so methods can be chained.

## Examples

```ts
// Transform closed linestrings in the default geometry column into polygons
await table.linesToPolygons().log();
```

```ts
// Transform closed linestrings in a specific column named 'routeLines' into polygons
await table.linesToPolygons("routeLines").log();
```
