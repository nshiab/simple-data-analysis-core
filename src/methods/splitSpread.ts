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
  const nbParts = newColumns.length;
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
        MAX(ARRAY_LENGTH(STRING_SPLIT("${column}", '${separator}'))) AS max_parts,
        MIN(ARRAY_LENGTH(STRING_SPLIT("${column}", '${separator}'))) AS min_parts
      FROM "${simpleTable.name}"`,
      mergeOptions(simpleTable, {
        table: simpleTable.name,
        method: "splitSpread()",
        parameters: { column, separator, newColumns },
        returnData: true,
      }),
    );

    if (partsResult && partsResult.length > 0) {
      const maxParts = partsResult[0].max_parts as number;
      const minParts = partsResult[0].min_parts as number;

      if (maxParts > nbParts) {
        // Get the first 5 rows with more parts than expected
        const problematicRows = await queryDB(
          simpleTable,
          `SELECT "${column}"
         FROM "${simpleTable.name}"
         WHERE ARRAY_LENGTH(STRING_SPLIT("${column}", '${separator}')) > ${nbParts}
         LIMIT 5`,
          mergeOptions(simpleTable, {
            table: simpleTable.name,
            method: "splitSpread()",
            parameters: { column, separator, newColumns },
            returnData: true,
          }),
        );

        const exampleRows = problematicRows
          ? problematicRows.map((row) => row[column]).join("\n  - ")
          : "";

        throw new Error(
          `Some rows contain more values after splitting (${maxParts}) than the number of new columns specified (${nbParts}).
When splitting by '${separator}', each row must produce at most ${nbParts} value(s) to fit in the columns: ${
            newColumns.join(", ")
          }.

First 5 rows with too many values:\n  - ${exampleRows}`,
        );
      }

      if (minParts < nbParts) {
        console.warn(
          `splitSpread() warning: Some rows contain fewer values after splitting (${minParts}) than the number of new columns (${nbParts}). Empty strings will be used for missing values.`,
        );
      }
    }
  }

  await queryDB(
    simpleTable,
    splitSpreadQuery(simpleTable.name, column, separator, newColumns),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "splitSpread()",
      parameters: { column, separator, newColumns },
    }),
  );
}

function splitSpreadQuery(
  table: string,
  column: string,
  separator: string,
  newColumns: string[],
) {
  // All columns are added in a single rewrite, so the table is scanned once
  // instead of once per ALTER + once per UPDATE.
  const splitColumns = newColumns
    .map(
      (col, i) =>
        `SPLIT_PART("${column}", '${separator}', ${i + 1}) AS "${col}"`,
    )
    .join(", ");

  return `CREATE OR REPLACE TABLE "${table}" AS SELECT *, ${splitColumns} FROM "${table}"`;
}
