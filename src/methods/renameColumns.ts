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
  const check = options.strict !== false;

  queueOp(simpleTable, {
    kind: "fusable",
    method: "renameColumns()",
    parameters: { names, options },
    needsSchema: check,
    buildSelect: (input, schema) => {
      if (check) {
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
