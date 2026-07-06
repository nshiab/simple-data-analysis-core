import parseType from "../helpers/parseTypes.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";

export default function convert(
  simpleTable: SimpleTable,
  types: {
    [key: string]:
      | "integer"
      | "float"
      | "number"
      | "string"
      | "date"
      | "time"
      | "datetime"
      | "datetimeTz"
      | "bigint"
      | "double"
      | "varchar"
      | "timestamp"
      | "timestamp with time zone"
      | "boolean";
  },
  options: {
    try?: boolean;
    datetimeFormat?: string;
  } = {},
) {
  simpleTable.pendingOps.push({
    kind: "fusable",
    method: "convert()",
    parameters: { types, options },
    needsSchema: true,
    buildSelect: (input, allTypes) => {
      const allColumns = Object.keys(allTypes);

      for (const col in types) {
        if (!allColumns.includes(col)) {
          throw new Error(
            `The column ${col} does not exist in the table.`,
          );
        }
      }

      return convertSelect(
        input,
        Object.keys(types),
        Object.values(types),
        allColumns,
        allTypes,
        options,
      );
    },
  });
}

function convertSelect(
  input: string,
  columns: string[],
  columnsTypes: (
    | "integer"
    | "float"
    | "number"
    | "string"
    | "date"
    | "time"
    | "datetime"
    | "datetimeTz"
    | "bigint"
    | "double"
    | "varchar"
    | "timestamp"
    | "timestamp with time zone"
    | "boolean"
  )[],
  allColumns: string[],
  allTypes: TableSchema,
  options: { datetimeFormat?: string; try?: boolean },
) {
  let query = `SELECT`;

  const cast = options.try ? "TRY_CAST" : "CAST";

  for (const column of allColumns) {
    const indexOf = columns.indexOf(column);
    if (indexOf === -1) {
      query += ` "${column}",`;
    } else {
      const expectedType = parseType(columnsTypes[indexOf]);
      const currentType = allTypes[column];
      const datetimeFormatExist = typeof options.datetimeFormat === "string";

      const stringToNumber = currentType === "VARCHAR" &&
        ["DOUBLE", "BIGINT"].includes(expectedType);
      const stringToDate = currentType === "VARCHAR" &&
        (expectedType.includes("TIME") || expectedType.includes("DATE"));
      const dateToString = (currentType.includes("DATE") ||
        currentType.includes("TIME")) &&
        expectedType === "VARCHAR";
      const timeToMs = currentType.includes("TIME") &&
        ["DOUBLE", "BIGINT"].includes(expectedType);
      const dateToMs = currentType.includes("DATE") &&
        ["DOUBLE", "BIGINT"].includes(expectedType);
      const msToTime = ["DOUBLE", "BIGINT"].includes(currentType) &&
        expectedType === "TIME";
      const msToDate = ["DOUBLE", "BIGINT"].includes(currentType) &&
        expectedType.includes("DATE");
      const msToTimestamp = ["DOUBLE", "BIGINT"].includes(currentType) &&
        expectedType.includes("TIMESTAMP");

      if (datetimeFormatExist && stringToDate) {
        query +=
          ` strptime("${column}", '${options.datetimeFormat}') AS "${column}",`;
      } else if (datetimeFormatExist && dateToString) {
        query +=
          ` strftime("${column}", '${options.datetimeFormat}') AS "${column}",`;
      } else if (timeToMs) {
        query += ` date_part('epoch', "${column}") * 1000 AS "${column}",`;
      } else if (dateToMs) {
        query += ` epoch("${column}") * 1000 AS "${column}",`;
      } else if (msToTime) {
        query +=
          ` TIME '00:00:00' + to_milliseconds("${column}") AS "${column}",`;
      } else if (msToDate) {
        query +=
          ` DATE '1970-01-01' + to_milliseconds("${column}") AS "${column}",`;
      } else if (msToTimestamp) {
        query +=
          ` TIMESTAMP '1970-01-01 00:00:00' + to_milliseconds("${column}") AS "${column}",`;
      } else if (stringToNumber) {
        // Thousand separators would make the cast fail.
        query += ` ${cast}(REPLACE("${column}", ',', '') AS ${
          parseType(columnsTypes[indexOf])
        }) AS "${column}",`;
      } else {
        query += ` ${cast}("${columns[indexOf]}" AS ${
          parseType(
            columnsTypes[indexOf],
          )
        }) AS "${columns[indexOf]}",`;
      }
    }
  }

  query = query.slice(0, query.length - 1);
  query += ` FROM ${input}`;

  return query;
}
