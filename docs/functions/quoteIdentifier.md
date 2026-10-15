[**Simple Data Analysis Core v2.1.12**](../index.md)

***

[Simple Data Analysis Core](../globals.md) / quoteIdentifier

# Function: quoteIdentifier()

> **quoteIdentifier**(`identifier`): `string`

Quotes one SQL identifier and escapes embedded double quotes.
Use this for library-generated table, column, schema, database, and alias
names. User-authored SQL expressions must remain unmodified.

## Parameters

### identifier

`string`

The identifier to quote.

## Returns

`string`

The identifier wrapped in double quotes with embedded quotes doubled.

## Example

```ts
quoteIdentifier('people "archive"');
// '"people ""archive"""'
```
