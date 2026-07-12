import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function longer(
  simpleTable: SimpleTable,
  columns: string[],
  namesTo: string,
  valuesTo: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "longer()",
    parameters: { columns, namesTo, valuesTo },
    needsSchema: true,
    buildSelect: (input, schema) => {
      // The pivoted columns are consumed by UNPIVOT and don't appear in the
      // output, so namesTo/valuesTo may reuse one of those names.
      assertNewColumns(schema, [namesTo, valuesTo], "longer()", columns);

      return `SELECT * FROM (
            FROM ${input} UNPIVOT INCLUDE NULLS (
            "${valuesTo}"
            for "${namesTo}" in (${columns.map((d) => `"${d}"`).join(", ")})
            )
        )`;
    },
  });
}
