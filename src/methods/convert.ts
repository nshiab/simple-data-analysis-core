import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import parseType from "../helpers/parseTypes.ts";
import queueOp from "../helpers/queueOp.ts";
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
    strict?: boolean;
    datetimeFormat?: string;
  } = {},
) {
  types = structuredClone(types);
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "convert()",
    parameters: { types, options },
    needsSchema: true,
    values: (allTypes) =>
      getDatetimeFormatValues(
        Object.keys(types),
        Object.values(types),
        Object.keys(allTypes),
        allTypes,
        options,
      ),
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

export function convertSelect(
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
  options: { datetimeFormat?: string; strict?: boolean },
) {
  let query = `SELECT`;

  const cast = options.strict === false ? "TRY_CAST" : "CAST";

  for (const column of allColumns) {
    const indexOf = columns.indexOf(column);
    if (indexOf === -1) {
      query += ` ${quoteIdentifier(column)},`;
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
        query += ` strptime(${quoteIdentifier(column)}, ?) AS ${
          quoteIdentifier(column)
        },`;
      } else if (datetimeFormatExist && dateToString) {
        query += ` strftime(${quoteIdentifier(column)}, ?) AS ${
          quoteIdentifier(column)
        },`;
      } else if (timeToMs) {
        query += ` date_part('epoch', ${quoteIdentifier(column)}) * 1000 AS ${
          quoteIdentifier(column)
        },`;
      } else if (dateToMs) {
        query += ` epoch(${quoteIdentifier(column)}) * 1000 AS ${
          quoteIdentifier(column)
        },`;
      } else if (msToTime) {
        query += ` TIME '00:00:00' + to_milliseconds(${
          quoteIdentifier(column)
        }) AS ${quoteIdentifier(column)},`;
      } else if (msToDate) {
        query += ` DATE '1970-01-01' + to_milliseconds(${
          quoteIdentifier(column)
        }) AS ${quoteIdentifier(column)},`;
      } else if (msToTimestamp) {
        query += ` TIMESTAMP '1970-01-01 00:00:00' + to_milliseconds(${
          quoteIdentifier(column)
        }) AS ${quoteIdentifier(column)},`;
      } else if (stringToNumber) {
        // Thousand separators would make the cast fail.
        query += ` ${cast}(REPLACE(${quoteIdentifier(column)}, ',', '') AS ${
          parseType(columnsTypes[indexOf])
        }) AS ${quoteIdentifier(column)},`;
      } else {
        query += ` ${cast}(${quoteIdentifier(columns[indexOf])} AS ${
          parseType(
            columnsTypes[indexOf],
          )
        }) AS ${quoteIdentifier(columns[indexOf])},`;
      }
    }
  }

  query = query.slice(0, query.length - 1);
  query += ` FROM ${input}`;

  return query;
}

function getDatetimeFormatValues(
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
  options: { datetimeFormat?: string },
): string[] {
  const datetimeFormat = options.datetimeFormat;
  if (typeof datetimeFormat !== "string") {
    return [];
  }
  return allColumns.flatMap((column) => {
    const index = columns.indexOf(column);
    if (index === -1) {
      return [];
    }
    const currentType = allTypes[column];
    const expectedType = parseType(columnsTypes[index]);
    const stringToDate = currentType === "VARCHAR" &&
      (expectedType.includes("TIME") || expectedType.includes("DATE"));
    const dateToString = (currentType.includes("DATE") ||
      currentType.includes("TIME")) && expectedType === "VARCHAR";
    return stringToDate || dateToString ? [datetimeFormat] : [];
  });
}
