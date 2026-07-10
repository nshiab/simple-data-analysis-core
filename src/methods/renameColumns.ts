import assertColumnsExist from "../helpers/assertColumnsExist.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function renameColumns(
  simpleTable: SimpleTable,
  names: { [key: string]: string },
  options: { strict?: boolean } = {},
) {
  const oldNames = Object.keys(names);
  const newNames = Object.values(names);
  // DuckDB's SELECT * RENAME silently drops a rename whose source column is
  // absent, so a typo would pass unnoticed. Validating requires the schema;
  // strict: false skips both the check and its DESCRIBE round-trip.
  const strict = options.strict !== false;

  queueOp(simpleTable, {
    kind: "fusable",
    method: "renameColumns()",
    parameters: { names, options },
    needsSchema: strict,
    buildSelect: (input, schema) => {
      if (strict) {
        assertColumnsExist(schema, oldNames, "renameColumns()");
      }
      return `SELECT * RENAME (${
        oldNames
          .map((d, i) => `"${d}" AS "${newNames[i]}"`)
          .join(", ")
      }) FROM ${input}`;
    },
  });
}
