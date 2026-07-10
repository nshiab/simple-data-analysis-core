import parseValue from "../helpers/parseValue.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function removeValues(
  simpleTable: SimpleTable,
  columnsAndValues: {
    [key: string]:
      | (number | string | Date | boolean | null)[]
      | (number | string | Date | boolean | null);
  },
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "removeValues()",
    parameters: { columnsAndValues },
    needsSchema: false,
    buildSelect: (input) => removeSelect(input, columnsAndValues),
  });
}

function removeSelect(
  input: string,
  columnsAndValues: {
    [key: string]:
      | (number | string | Date | boolean | null)[]
      | (number | string | Date | boolean | null);
  },
) {
  let query = `SELECT * FROM ${input} WHERE\n`;
  const columns = Object.keys(columnsAndValues);

  const conditions = [];
  for (const column of columns) {
    let values = columnsAndValues[column];
    if (!Array.isArray(values)) {
      values = [values];
    }

    conditions.push(
      `"${column}" NOT IN (${values.map((d) => parseValue(d)).join(", ")})`,
    );
  }

  query += conditions.join("\nAND ");

  return query;
}
