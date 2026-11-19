import foldIdentifier from "../helpers/foldIdentifier.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import quoteQualifiedIdentifier from "../helpers/quoteQualifiedIdentifier.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function nest(simpleTable: SimpleTable, column: string, by: string | string[]) {
  if (typeof column !== "string" || column.length === 0) {
    throw new TypeError("nest() column must be a non-empty column name.");
  }
  if (typeof by !== "string" && !Array.isArray(by)) {
    throw new TypeError("nest() by must be a column name or an array of column names.");
  }

  const categories = stringToArray(by);
  if (
    categories.length === 0 ||
    categories.some((category) => typeof category !== "string" || category.length === 0)
  ) {
    throw new TypeError("nest() by must contain at least one non-empty column name.");
  }
  const usedNames = new Set(categories.map(foldIdentifier));
  const valueName = foldIdentifier(column);
  if (usedNames.size !== categories.length || usedNames.has(valueName)) {
    throw new Error("nest() choose distinct grouping columns and a separate column to collect.");
  }

  usedNames.add(valueName);
  let orderName = "__sda_nest_order";
  while (usedNames.has(orderName)) {
    orderName += "_";
  }
  const order = quoteIdentifier(orderName);
  const value = quoteIdentifier(column);
  const groups = categories.map(quoteIdentifier);
  const groupBy = groups.join(", ");
  const orderBy = groups.map((group) => `${group} ASC`).join(", ");
  const source = "__sda_nest_source";
  const inputColumns = [...categories, column]
    .map((name) => quoteQualifiedIdentifier(source, name))
    .join(", ");

  queueOp(simpleTable, {
    kind: "fusable",
    method: "nest()",
    parameters: { column, by: categories },
    needsSchema: false,
    buildSelect: (input) => `SELECT ${groupBy}, LIST(${value} ORDER BY ${order}) AS ${value}
FROM (
  SELECT ${inputColumns}, ROW_NUMBER() OVER () AS ${order}
  FROM ${input} AS ${quoteIdentifier(source)}
)
GROUP BY ${groupBy}
ORDER BY ${orderBy}`,
  });
}
