import type SimpleTable from "../class/SimpleTable.ts";
import getIdenticalColumns from "../helpers/getIdenticalColumns.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";

export default async function fuzzyJoin(
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
) {
  if (leftColumn === rightColumn) {
    throw new Error(
      `The leftColumn and rightColumn have the same name "${leftColumn}". Rename one of them before doing the fuzzy join.`,
    );
  }

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
          identicalColumnsForError.map((d) => `"${d}"`).join(", ")
        } in one of the two tables before doing the fuzzy join.`,
      );
    }
  }

  const method = options.method ?? "ratio";
  const similarityColumn = options.similarityColumn;
  const outputTableName = typeof options.outputTable === "string"
    ? options.outputTable
    : leftTable.name;

  const sql = `INSTALL rapidfuzz FROM community; LOAD rapidfuzz;\n` +
    fuzzyJoinQuery(
      leftTable.name,
      leftColumn,
      rightTable.name,
      rightColumn,
      method,
      threshold,
      outputTableName,
      similarityColumn,
      options.preFilterPrefixLen,
    );

  await queryDB(
    leftTable,
    sql,
    mergeOptions(leftTable, {
      table: outputTableName,
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

  const outputTable = typeof options.outputTable === "string"
    ? leftTable.sdb.newTable(options.outputTable)
    : leftTable;

  // Remove the duplicate right-column produced when leftColumn === rightColumn
  // (DuckDB suffixes it with _1 in SELECT *)
  const outputCols = await outputTable.getColumns();
  const duplicateCol = `${rightColumn}_1`;
  if (outputCols.includes(duplicateCol)) {
    await outputTable.removeColumns([duplicateCol]);
  }

  return outputTable;
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
  preFilterPrefixLen?: number,
) {
  const fn =
    `ROUND(rapidfuzz_${method}("${leftTable}"."${leftColumn}", "${rightTable}"."${rightColumn}"), 2)`;

  let onClause = `${fn} >= ${threshold}`;

  if (method === "ratio") {
    const maxDiffMultiplier = (200 - 2 * threshold) / (200 - threshold);
    onClause +=
      ` AND ABS(LENGTH("${leftTable}"."${leftColumn}") - LENGTH("${rightTable}"."${rightColumn}")) <= ${maxDiffMultiplier} * GREATEST(LENGTH("${leftTable}"."${leftColumn}"), LENGTH("${rightTable}"."${rightColumn}"))`;
  }
  if (preFilterPrefixLen !== undefined) {
    onClause +=
      ` AND SUBSTR("${leftTable}"."${leftColumn}", 1, ${preFilterPrefixLen}) = SUBSTR("${rightTable}"."${rightColumn}", 1, ${preFilterPrefixLen})`;
  }

  if (similarityColumn) {
    return `CREATE OR REPLACE TABLE "${outputTable}" AS
SELECT * EXCLUDE ("_sda_score"), "_sda_score" AS "${similarityColumn}"
FROM (
  SELECT "${leftTable}".*, "${rightTable}".*, ${fn} AS "_sda_score"
  FROM "${leftTable}" LEFT JOIN "${rightTable}" ON ${onClause}
) _sda
ORDER BY "${leftColumn}", "_sda_score" DESC;\n`;
  }

  return `CREATE OR REPLACE TABLE "${outputTable}" AS
SELECT *
FROM (
  SELECT "${leftTable}".*, "${rightTable}".*
  FROM "${leftTable}" LEFT JOIN "${rightTable}" ON ${onClause}
) _sda
ORDER BY "${leftColumn}", "${rightColumn}";\n`;
}
