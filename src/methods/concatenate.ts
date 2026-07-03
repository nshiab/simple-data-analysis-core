import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function concatenate(
  simpleTable: SimpleTable,
  columns: string[],
  newColumn: string,
  options: {
    separator?: string;
  } = {},
) {
  await queryDB(
    simpleTable,
    concatenateQuery(simpleTable.name, columns, newColumn, options),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "concatenate()",
      parameters: { columns, newColumn, options },
    }),
  );
}

function concatenateQuery(
  table: string,
  columns: string[],
  newColumn: string,
  options: { separator?: string },
) {
  let query = `ALTER TABLE "${table}" ADD "${newColumn}" VARCHAR;
    UPDATE "${table}" SET "${newColumn}" = `;
  if (typeof options.separator === "string") {
    query += `CONCAT_WS('${options.separator}', ${
      columns
        .map((d) => `"${d}"`)
        .join(", ")
    })`;
  } else {
    query += `CONCAT(${columns.map((d) => `"${d}"`).join(", ")})`;
  }

  return query;
}
