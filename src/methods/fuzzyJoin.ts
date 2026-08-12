import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import getIdenticalColumns from "../helpers/getIdenticalColumns.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import assertSameDatabase from "../helpers/assertSameDatabase.ts";

export default function fuzzyJoin(
  leftTable: SimpleTable,
  rightTable: SimpleTable,
  leftColumn: string,
  rightColumn: string,
  threshold: number,
  options: {
    method?:
      | "ratio"
      | "partial_ratio"
      | "token_sort_ratio"
      | "token_set_ratio";
    similarityColumn?: string;
    outputTable?: string | boolean;
    preFilterPrefixLen?: number;
  } = {},
): SimpleTable {
  assertSameDatabase(leftTable.sdb, [rightTable], "fuzzyJoin()");
  options = structuredClone(options);
  // This validation doesn't need the database, so it stays at call time.
  if (leftColumn === rightColumn) {
    throw new Error(
      `The leftColumn and rightColumn have the same name ${
        quoteIdentifier(leftColumn)
      }. Rename one of them before doing the fuzzy join.`,
    );
  }

  // The output table instance is created at call time so it can be returned
  // synchronously and chained on right away.
  const outputTable = typeof options.outputTable === "string"
    ? leftTable.sdb.newTable(options.outputTable)
    : leftTable;

  queueOp(outputTable, {
    kind: "barrier",
    method: "fuzzyJoin()",
    parameters: {
      leftColumn,
      rightColumn,
      rightTable: rightTable.name,
      threshold,
      options,
    },
    execute: () =>
      executeFuzzyJoin(
        leftTable,
        rightTable,
        outputTable,
        leftColumn,
        rightColumn,
        threshold,
        options,
      ),
  });

  return outputTable;
}

async function executeFuzzyJoin(
  leftTable: SimpleTable,
  rightTable: SimpleTable,
  outputTable: SimpleTable,
  leftColumn: string,
  rightColumn: string,
  threshold: number,
  options: {
    method?:
      | "ratio"
      | "partial_ratio"
      | "token_sort_ratio"
      | "token_set_ratio";
    similarityColumn?: string;
    preFilterPrefixLen?: number;
  },
): Promise<void> {
  const leftCols = await leftTable.getColumns();
  const rightCols = await rightTable.getColumns();
  const identicalColumns = getIdenticalColumns(leftCols, rightCols);

  // Any column shared between both tables — other than rightColumn (whose
  // potential _1 duplicate we clean up) — would produce ambiguous output.
  const identicalColumnsForError = identicalColumns.filter(
    (d) => d !== rightColumn,
  );
  if (identicalColumnsForError.length > 0) {
    if (identicalColumnsForError.length === 1) {
      throw new Error(
        `The tables have columns with identical names. Rename or remove "${
          identicalColumnsForError[0]
        }" in one of the two tables before doing the fuzzy join.`,
      );
    } else {
      throw new Error(
        `The tables have columns with identical names. Rename or remove ${
          identicalColumnsForError.map((d) => `${quoteIdentifier(d)}`).join(
            ", ",
          )
        } in one of the two tables before doing the fuzzy join.`,
      );
    }
  }

  const method = options.method ?? "ratio";
  const similarityColumn = options.similarityColumn;

  // The right table's copy of a column shared with the left table (only
  // rightColumn can be shared, checked above) is excluded from the SELECT
  // directly, instead of dropping its _1 duplicate with a rewrite after the
  // join.
  const rightSelect = rightCols
    .filter((d) => !leftCols.includes(d))
    .map((d) => `${quoteIdentifier(rightTable.name)}.${quoteIdentifier(d)}`)
    .join(", ");

  const sql = `INSTALL rapidfuzz FROM community; LOAD rapidfuzz;\n` +
    fuzzyJoinQuery(
      leftTable.name,
      leftColumn,
      rightTable.name,
      rightColumn,
      method,
      threshold,
      outputTable.name,
      similarityColumn,
      rightSelect,
      options.preFilterPrefixLen,
    );

  await queryDB(
    leftTable,
    sql,
    mergeOptions(leftTable, {
      table: outputTable.name,
      method: "fuzzyJoin()",
      parameters: {
        leftColumn,
        rightColumn,
        rightTable: rightTable.name,
        threshold,
        options,
      },
    }),
  );
}

function fuzzyJoinQuery(
  leftTable: string,
  leftColumn: string,
  rightTable: string,
  rightColumn: string,
  method:
    | "ratio"
    | "partial_ratio"
    | "token_sort_ratio"
    | "token_set_ratio",
  threshold: number,
  outputTable: string,
  similarityColumn: string | undefined,
  rightSelect: string,
  preFilterPrefixLen?: number,
) {
  const fn = `ROUND(rapidfuzz_${method}(${quoteIdentifier(leftTable)}.${
    quoteIdentifier(leftColumn)
  }, ${quoteIdentifier(rightTable)}.${quoteIdentifier(rightColumn)}), 2)`;

  let onClause = `${fn} >= ${threshold}`;

  if (method === "ratio") {
    const maxDiffMultiplier = (200 - 2 * threshold) / (200 - threshold);
    onClause += ` AND ABS(LENGTH(${quoteIdentifier(leftTable)}.${
      quoteIdentifier(leftColumn)
    }) - LENGTH(${quoteIdentifier(rightTable)}.${
      quoteIdentifier(rightColumn)
    })) <= ${maxDiffMultiplier} * GREATEST(LENGTH(${
      quoteIdentifier(leftTable)
    }.${quoteIdentifier(leftColumn)}), LENGTH(${quoteIdentifier(rightTable)}.${
      quoteIdentifier(rightColumn)
    }))`;
  }
  if (preFilterPrefixLen !== undefined) {
    onClause += ` AND SUBSTR(${quoteIdentifier(leftTable)}.${
      quoteIdentifier(leftColumn)
    }, 1, ${preFilterPrefixLen}) = SUBSTR(${quoteIdentifier(rightTable)}.${
      quoteIdentifier(rightColumn)
    }, 1, ${preFilterPrefixLen})`;
  }

  if (similarityColumn) {
    return `CREATE OR REPLACE TABLE ${quoteIdentifier(outputTable)} AS
SELECT * EXCLUDE ("_sda_score"), "_sda_score" AS ${
      quoteIdentifier(similarityColumn)
    }
FROM (
  SELECT ${quoteIdentifier(leftTable)}.*, ${rightSelect}, ${fn} AS "_sda_score"
  FROM ${quoteIdentifier(leftTable)} LEFT JOIN ${
      quoteIdentifier(rightTable)
    } ON ${onClause}
) _sda
ORDER BY ${quoteIdentifier(leftColumn)}, "_sda_score" DESC;\n`;
  }

  return `CREATE OR REPLACE TABLE ${quoteIdentifier(outputTable)} AS
SELECT *
FROM (
  SELECT ${quoteIdentifier(leftTable)}.*, ${rightSelect}
  FROM ${quoteIdentifier(leftTable)} LEFT JOIN ${
    quoteIdentifier(rightTable)
  } ON ${onClause}
) _sda
ORDER BY ${quoteIdentifier(leftColumn)}, ${quoteIdentifier(rightColumn)};\n`;
}
