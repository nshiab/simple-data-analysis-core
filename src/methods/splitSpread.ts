import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function splitSpread(
  simpleTable: SimpleTable,
  column: string,
  separator: string,
  newColumns: string[],
  options: {
    strict?: boolean;
  } = {},
) {
  newColumns = [...newColumns];
  if (newColumns.length === 0) {
    throw new Error(
      "splitSpread() newColumns must contain at least one column.",
    );
  }
  options = structuredClone(options);
  // The pre-validation queries the data, so splitSpread can't be expressed
  // as a single SELECT over its input: it executes as a barrier.
  queueOp(simpleTable, {
    kind: "barrier",
    method: "splitSpread()",
    parameters: { column, separator, newColumns, options },
    execute: () =>
      executeSplitSpread(simpleTable, column, separator, newColumns, options),
  });
}

async function executeSplitSpread(
  simpleTable: SimpleTable,
  column: string,
  separator: string,
  newColumns: string[],
  options: {
    strict?: boolean;
  },
): Promise<void> {
  const partCount = newColumns.length;
  const strict = options.strict !== false;

  // A SELECT *, expr AS col colliding with an existing column would be
  // silently renamed by DuckDB (col -> col_1) instead of erroring, unlike
  // the ALTER TABLE ADD this used to run.
  assertNewColumns(await simpleTable.getTypes(), newColumns, "splitSpread()");

  if (strict) {
    // Both bounds come from the same scan instead of one query each.
    const partsResult = await queryDB(
      simpleTable,
      `SELECT
        MAX(ARRAY_LENGTH(STRING_SPLIT(${
        quoteIdentifier(column)
      }, ?))) AS max_parts,
        MIN(ARRAY_LENGTH(STRING_SPLIT(${
        quoteIdentifier(column)
      }, ?))) AS min_parts
      FROM ${quoteIdentifier(simpleTable.name)}`,
      mergeOptions(simpleTable, {
        table: simpleTable.name,
        method: "splitSpread()",
        parameters: { column, separator, newColumns },
        returnData: true,
        values: [separator, separator],
      }),
    );

    if (partsResult && partsResult.length > 0) {
      const maxParts = partsResult[0].max_parts as number;
      const minParts = partsResult[0].min_parts as number;

      if (maxParts > partCount) {
        // Get the first 5 rows with more parts than expected
        const problematicRows = await queryDB(
          simpleTable,
          `SELECT ${quoteIdentifier(column)}
         FROM ${quoteIdentifier(simpleTable.name)}
         WHERE ARRAY_LENGTH(STRING_SPLIT(${
            quoteIdentifier(column)
          }, ?)) > ${partCount}
         LIMIT 5`,
          mergeOptions(simpleTable, {
            table: simpleTable.name,
            method: "splitSpread()",
            parameters: { column, separator, newColumns },
            returnData: true,
            values: [separator],
          }),
        );

        const exampleRows = problematicRows
          ? problematicRows.map((row) => row[column]).join("\n  - ")
          : "";

        throw new Error(
          `Some rows contain more values after splitting (${maxParts}) than the number of new columns specified (${partCount}).
When splitting by '${separator}', each row must produce at most ${partCount} value(s) to fit in the columns: ${
            newColumns.join(", ")
          }.

First 5 rows with too many values:\n  - ${exampleRows}`,
        );
      }

      if (minParts < partCount) {
        console.warn(
          `splitSpread() warning: Some rows contain fewer values after splitting (${minParts}) than the number of new columns (${partCount}). Empty strings will be used for missing values.`,
        );
      }
    }
  }

  const split = splitSpreadQuery(
    simpleTable.name,
    column,
    separator,
    newColumns,
  );
  await queryDB(
    simpleTable,
    split.query,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "splitSpread()",
      parameters: { column, separator, newColumns },
      values: split.values,
    }),
  );
}

function splitSpreadQuery(
  table: string,
  column: string,
  separator: string,
  newColumns: string[],
): { query: string; values: string[] } {
  // All columns are added in a single rewrite, so the table is scanned once
  // instead of once per ALTER + once per UPDATE.
  const splitColumns = newColumns
    .map(
      (col, i) =>
        `SPLIT_PART(${quoteIdentifier(column)}, ?, ${i + 1}) AS ${
          quoteIdentifier(col)
        }`,
    )
    .join(", ");

  const query = `CREATE OR REPLACE TABLE ${
    quoteIdentifier(table)
  } AS SELECT *, ${splitColumns} FROM ${quoteIdentifier(table)}`;
  return { query, values: newColumns.map(() => separator) };
}
