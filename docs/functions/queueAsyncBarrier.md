[**Simple Data Analysis Core v2.1.16**](../index.md)

***

[Simple Data Analysis Core](../globals.md) / queueAsyncBarrier

# Function: queueAsyncBarrier()

> **queueAsyncBarrier**(`simpleTable`, `operation`): `void`

Queues asynchronous extension work as one ordered table-builder step.
Builder operations queued by `execute` are scoped to the barrier and drain
before its observer queries and before later chained operations.

`execute` must await all asynchronous work that can queue table operations.
Detached work is outside the barrier's program-order scope.

If `execute` rejects, captured builder operations that have not already
drained are discarded. Operations drained by an observer inside `execute`
remain applied; an asynchronous barrier does not provide database rollback.

This differs from a failure while executing queued builders: during replay,
the failing table's remaining chain is aborted, but unexecuted work for other
tables is requeued for their next observation.

## Parameters

### simpleTable

[`SimpleTable`](../classes/SimpleTable.md)

The table whose chain owns the asynchronous work.

### operation

The asynchronous extension operation to queue.

#### execute

() => `Promise`\<`void`\>

The asynchronous work to run at the barrier's position in the chain.

#### method

`string`

The public method name used for diagnostics.

#### parameters

\{\[`key`: `string`\]: `unknown`; \} \| `null`

A snapshot of the public method parameters used for diagnostics.

## Returns

`void`

Nothing. The public builder should return its target table.

## Example

```ts
import type { SimpleTable } from "@nshiab/simple-data-analysis-core";
import { queueAsyncBarrier } from "@nshiab/simple-data-analysis-core/helpers";

function loadRemote(table: SimpleTable, url: string): SimpleTable {
  queueAsyncBarrier(table, {
    method: "loadRemote()",
    parameters: { url },
    execute: async () => {
      const rows = await fetch(url).then((response) => response.json()) as
        { [key: string]: unknown }[];
      table.loadArray(rows);
    },
  });
  return table;
}
```
