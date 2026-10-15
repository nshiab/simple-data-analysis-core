[**Simple Data Analysis Core v2.1.13**](../index.md)

***

[Simple Data Analysis Core](../globals.md) / stringToArray

# Function: stringToArray()

> **stringToArray**(`argument`): `string`[]

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
