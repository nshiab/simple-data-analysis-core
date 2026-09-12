import type { DuckDBValue } from "@duckdb/node-api";
import type SimpleTable from "../class/SimpleTable.ts";
import type { TableSchema } from "./pendingOps.ts";
import queueOp from "./queueOp.ts";
import quoteIdentifier from "./quoteIdentifier.ts";
import resolveOutputTable from "./resolveOutputTable.ts";

type GraphResult = {
  buildSelect: (input: string, schema: TableSchema) => string;
  method: string;
  outputSchema: (schema: TableSchema) => TableSchema;
  outputTable?: string | boolean;
  parameters: { [key: string]: unknown };
  values: (schema: TableSchema) => DuckDBValue[];
};

/** Queues a graph SELECT for overwrite or a source-preserving output table. */
export default function queueGraphResult(
  simpleTable: SimpleTable,
  result: GraphResult,
): SimpleTable {
  const resolvedOutput = resolveOutputTable(simpleTable, result.outputTable);
  const outputTable = typeof resolvedOutput === "string"
    ? simpleTable.sdb.newTable(resolvedOutput)
    : simpleTable;

  if (outputTable !== simpleTable) {
    queueOp(outputTable, {
      kind: "source",
      method: result.method,
      parameters: result.parameters,
      rawSQL: [quoteIdentifier(simpleTable.name)],
      buildSelect: () => `SELECT * FROM ${quoteIdentifier(simpleTable.name)}`,
    });
  }

  queueOp(outputTable, {
    kind: "fusable",
    method: result.method,
    parameters: result.parameters,
    needsSchema: true,
    values: result.values,
    buildSelect: result.buildSelect,
    outputSchema: result.outputSchema,
  });
  return outputTable;
}
