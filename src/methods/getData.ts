import hasGeometryColumn from "../helpers/hasGeometryColumn.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function getData(
  simpleTable: SimpleTable,
  options: {
    columns?: string | string[];
    conditions?: string;
  } = {},
) {
  if (await hasGeometryColumn(simpleTable)) {
    throw new Error(
      "Table contains geometry columns. Use getGeoData() instead.",
    );
  }

  const columns = options.columns
    ? (typeof options.columns === "string"
      ? [options.columns]
      : options.columns)
    : undefined;
  return (await queryDB(
    simpleTable,
    `SELECT ${
      columns ? columns.map((d) => `"${d}"`).join(", ") : "*"
    } from "${simpleTable.name}"${
      options.conditions ? ` WHERE ${options.conditions}` : ""
    }`,
    mergeOptions(simpleTable, {
      returnDataFrom: "query",
      table: simpleTable.name,
      method: "getData()",
      parameters: { options },
    }),
  )) as {
    [key: string]: unknown;
  }[];
}
