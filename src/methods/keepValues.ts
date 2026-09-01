import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import prepareValueFilters, {
  type ValueFilter,
} from "../helpers/prepareValueFilters.ts";

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
  const filters = prepareValueFilters(captured);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "keepValues()",
    parameters: { columnsAndValues: captured },
    values: filters.flatMap((filter) => filter.values),
    needsSchema: false,
    buildSelect: (input) => keepValuesSelect(input, filters),
  });
}

function keepValuesSelect(
  input: string,
  filters: ValueFilter[],
) {
  let query = `SELECT * FROM ${input} WHERE\n`;

  const conditions = [];
  for (const filter of filters) {
    const column = quoteIdentifier(filter.column);
    const inValues = filter.values.length > 0
      ? `${column} IN (${filter.values.map(() => "?").join(", ")})`
      : null;
    conditions.push(
      inValues === null
        ? filter.includesNull ? `${column} IS NULL` : "FALSE"
        : filter.includesNull
        ? `(${inValues} OR ${column} IS NULL)`
        : inValues,
    );
  }

  query += conditions.join("\nAND ");

  return query;
}
