[**Simple Data Analysis Core v2.1.17**](../index.md)

***

[Simple Data Analysis Core](../globals.md) / parseValue

# Function: parseValue()

> **parseValue**(`value`): `string` \| `number` \| `boolean`

Defined in: [src/helpers/parseValue.ts:20](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.17/src/helpers/parseValue.ts#L20)

Converts a JavaScript value to a SQL literal. Strings are quoted with embedded
quotes escaped, dates become quoted ISO strings, and null, undefined, or NaN
become `"NULL"`. Numbers and booleans are returned unchanged.

## Parameters

### value

`unknown`

A string, number, boolean, Date, null, or undefined.

## Returns

`string` \| `number` \| `boolean`

A SQL literal, or the original number or boolean.

## Example

```ts
import { parseValue } from "@nshiab/simple-data-analysis-core/helpers";
console.log(parseValue("O'Brien")); // "'O''Brien'"
console.log(parseValue(null)); // "NULL"
```

## Throws

If the value has an unsupported type.
