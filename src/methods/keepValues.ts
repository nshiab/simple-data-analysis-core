import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import toDuckDBValue from "../helpers/toDuckDBValue.ts";

export default function keepValues(
  simpleTable: SimpleTable,
  columnsAndValues: { [key: string]: unknown },
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
    method: "keepValues()",
    parameters: { columnsAndValues: captured },
    values,
    needsSchema: false,
    buildSelect: (input) => keepValuesSelect(input, captured),
  });
}

function keepValuesSelect(
  input: string,
  columnsAndValues: { [key: string]: unknown },
) {
  let query = `SELECT * FROM ${input} WHERE\n`;
  const columns = Object.keys(columnsAndValues);

  const conditions = [];
  for (const column of columns) {
    const values = Array.isArray(columnsAndValues[column])
      ? columnsAndValues[column]
      : [columnsAndValues[column]];

    conditions.push(
      `${quoteIdentifier(column)} IN (${values.map(() => "?").join(", ")})`,
    );
  }

  query += conditions.join("\nAND ");

  return query;
}
