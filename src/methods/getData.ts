import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import quoteQualifiedIdentifier from "../helpers/quoteQualifiedIdentifier.ts";

export default async function getData(
  simpleTable: SimpleTable,
  options: {
    columns?: string | string[];
    conditions?: string;
    limit?: number;
  } = {},
) {
  if (
    options.limit !== undefined &&
    (!Number.isInteger(options.limit) || options.limit < 0)
  ) {
    throw new Error(
      "getData() limit must be an integer greater than or equal to 0.",
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
      columns
        ? columns.map((column) =>
          quoteQualifiedIdentifier(simpleTable.name, column)
        ).join(", ")
        : "*"
    } from ${quoteIdentifier(simpleTable.name)}${
      options.conditions ? ` WHERE ${options.conditions}` : ""
    }${options.limit === undefined ? "" : ` LIMIT ${options.limit}`}`,
    mergeOptions(simpleTable, {
      returnData: true,
      table: simpleTable.name,
      method: "getData()",
      parameters: { options },
    }),
  )) as {
    [key: string]: unknown;
  }[];
}
