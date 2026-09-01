import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import prepareValueFilters, {
  type ValueFilter,
} from "../helpers/prepareValueFilters.ts";

export default function removeValues(
  simpleTable: SimpleTable,
  columnsAndValues: { [key: string]: unknown },
) {
  const captured = Object.fromEntries(
    Object.entries(columnsAndValues).map(([column, values]) => [
      column,
      Array.isArray(values) ? [...values] : values,
    ]),
  ) as typeof columnsAndValues;
  const filters = prepareValueFilters(captured);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "removeValues()",
    parameters: { columnsAndValues: captured },
    values: filters.flatMap((filter) => filter.values),
    needsSchema: false,
    buildSelect: (input) => removeValuesSelect(input, filters),
  });
}

function removeValuesSelect(
  input: string,
  filters: ValueFilter[],
) {
  let query = `SELECT * FROM ${input} WHERE\n`;

  const conditions = [];
  for (const filter of filters) {
    const column = quoteIdentifier(filter.column);
    const notInValues = filter.values.length > 0
      ? `${column} NOT IN (${filter.values.map(() => "?").join(", ")})`
      : null;
    conditions.push(
      notInValues === null
        ? filter.includesNull ? `${column} IS NOT NULL` : "TRUE"
        : filter.includesNull
        ? `(${notInValues} AND ${column} IS NOT NULL)`
        : `(${notInValues} OR ${column} IS NULL)`,
    );
  }

  query += conditions.join("\nAND ");

  return query;
}
