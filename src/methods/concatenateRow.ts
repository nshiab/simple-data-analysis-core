import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function concatenateRow(
  simpleTable: SimpleTable,
  columns: string[],
  newColumn: string,
) {
  const allTypes = await simpleTable.getTypes();
  for (const col of columns) {
    if (allTypes[col] !== "VARCHAR") {
      throw new Error(
        `The column ${col} is of type ${
          allTypes[col]
        }. The concatenateRow() method only works with string columns. Please convert the column to string first with the .convert() method.`,
      );
    }
  }

  await queryDB(
    simpleTable,
    concatenateRowQuery(simpleTable.name, columns, newColumn),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "concatenateRow()",
      parameters: { columns, newColumn },
    }),
  );
}

function concatenateRowQuery(
  table: string,
  columns: string[],
  newColumn: string,
) {
  const parts = columns.map(
    (col, i) =>
      i === 0
        ? `'${col}:\n' || COALESCE("${col}", 'Unknown')`
        : `'\n\n${col}:\n' || COALESCE("${col}", 'Unknown')`,
  );
  const concatenatedExpression = parts.join(" || ");

  const query = `ALTER TABLE "${table}" ADD "${newColumn}" VARCHAR;
    UPDATE "${table}" SET "${newColumn}" = ${concatenatedExpression}`;

  return query;
}
