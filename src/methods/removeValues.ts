import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import toDuckDBValue from "../helpers/toDuckDBValue.ts";

export default function removeValues(
  simpleTable: SimpleTable,
  columnsAndValues: {
    [key: string]:
      | (number | string | Date | boolean | null)[]
      | (number | string | Date | boolean | null);
  },
) {
  const captured = Object.fromEntries(
    Object.entries(columnsAndValues).map(([column, values]) => [
      column,
      Array.isArray(values) ? [...values] : values,
    ]),
  ) as typeof columnsAndValues;
  const values = Object.values(captured).flatMap((value) =>
    (Array.isArray(value) ? value : [value]).map(toDuckDBValue)
  );
  queueOp(simpleTable, {
    kind: "fusable",
    method: "removeValues()",
    parameters: { columnsAndValues: captured },
    values,
    needsSchema: false,
    buildSelect: (input) => removeValuesSelect(input, captured),
  });
}

function removeValuesSelect(
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
      `${quoteIdentifier(column)} NOT IN (${values.map(() => "?").join(", ")})`,
    );
  }

  query += conditions.join("\nAND ");

  return query;
}
