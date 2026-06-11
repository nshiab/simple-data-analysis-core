export default function cloneQuery(
  table: string,
  newTable: string,
  columns: string[],
  options: {
    conditions?: string;
    nbRows?: number;
    offset?: number;
  } = {},
) {
  const selectClause = columns.length > 0
    ? columns.map((col) => `"${col}"`).join(", ")
    : "*";

  return `CREATE OR REPLACE TABLE "${newTable}" AS SELECT ${selectClause} FROM "${table}"${
    options.conditions ? ` WHERE ${options.conditions}` : ""
  }${typeof options.nbRows === "number" ? ` LIMIT ${options.nbRows}` : ""}${
    typeof options.offset === "number" ? ` OFFSET ${options.offset}` : ""
  }`;
}
