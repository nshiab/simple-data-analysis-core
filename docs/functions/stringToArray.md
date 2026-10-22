[**Simple Data Analysis Core v2.1.17**](../index.md)

***

[Simple Data Analysis Core](../globals.md) / stringToArray

# Function: stringToArray()

> **stringToArray**(`argument`): `string`[]

Defined in: [src/helpers/stringToArray.ts:16](https://github.com/nshiab/simple-data-analysis-core/blob/v2.1.17/src/helpers/stringToArray.ts#L16)

Normalizes a string or array of strings to a new array.
Existing arrays are copied so callers can change the result independently.

## Parameters

### argument

`string` \| `string`[]

One string or an array of strings.

## Returns

`string`[]

A new array containing the supplied strings.

## Example

```ts
import { stringToArray } from "@nshiab/simple-data-analysis-core/helpers";
console.log(stringToArray("name")); // ["name"]
console.log(stringToArray(["name", "age"])); // ["name", "age"]
```
