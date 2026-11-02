import type SimpleTable from "../class/SimpleTable.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import quoteQualifiedIdentifier from "../helpers/quoteQualifiedIdentifier.ts";
import stringToArray from "../helpers/stringToArray.ts";

export default function getUniquesQuery(simpleTable: SimpleTable, column: string | string[]) {
  const columns = [...new Set(stringToArray(column))];
  if (columns.length === 0) {
    throw new Error("getUniques() requires at least one column.");
  }
  const qualifiedColumns = columns.map((name) => quoteQualifiedIdentifier(simpleTable.name, name));
  return `SELECT DISTINCT ${qualifiedColumns.join(", ")} FROM ${quoteIdentifier(
    simpleTable.name,
  )} ORDER BY ${qualifiedColumns.map((name) => `${name} ASC`).join(", ")}`;
}
