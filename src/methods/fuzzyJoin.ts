import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import getIdenticalColumns from "../helpers/getIdenticalColumns.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import assertSameDatabase from "../helpers/assertSameDatabase.ts";
import buildFuzzyMatchSql, {
  type FuzzyMethod,
} from "../helpers/buildFuzzyMatchSql.ts";

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
    prefilterPrefixLength?: number;
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
    prefilterPrefixLength?: number;
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
  const queryOptions = mergeOptions(leftTable, {
    table: outputTable.name,
    method: "fuzzyJoin()",
    parameters: {
      leftColumn,
      rightColumn,
      rightTable: rightTable.name,
      threshold,
      options,
    },
  });
  const deduplicate = await shouldDeduplicateFuzzyJoin(
    leftTable,
    rightTable,
    leftColumn,
    rightColumn,
    queryOptions,
  );

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
      options.prefilterPrefixLength,
      deduplicate,
    );

  await queryDB(
    leftTable,
    sql,
    queryOptions,
  );
}

async function shouldDeduplicateFuzzyJoin(
  leftTable: SimpleTable,
  rightTable: SimpleTable,
  leftColumn: string,
  rightColumn: string,
  queryOptions: Parameters<typeof queryDB>[2],
): Promise<boolean> {
  const left = quoteIdentifier(leftTable.name);
  const right = quoteIdentifier(rightTable.name);
  const counts = (await queryDB(
    leftTable,
    `SELECT (SELECT COUNT(*) FROM ${left}) AS left_count,
      (SELECT COUNT(*) FROM ${right}) AS right_count`,
    { ...queryOptions, returnData: true },
  ))![0];
  const leftCount = Number(counts.left_count);
  const rightCount = Number(counts.right_count);
  const comparisons = leftCount * rightCount;
  // Avoid distinct scans for small joins and short lookup tables. For larger
  // joins, require at least a twofold reduction to pay for grouping and rejoining.
  if (comparisons < 100_000 || Math.min(leftCount, rightCount) < 32) {
    return false;
  }
  const distinct = (await queryDB(
    leftTable,
    `SELECT
      (SELECT COUNT(DISTINCT ENCODE(${
      quoteIdentifier(leftColumn)
    })) FROM ${left}) AS left_count,
      (SELECT COUNT(DISTINCT ENCODE(${
      quoteIdentifier(rightColumn)
    })) FROM ${right}) AS right_count`,
    { ...queryOptions, returnData: true },
  ))![0];
  return Number(distinct.left_count) * Number(distinct.right_count) <=
    comparisons / 2;
}

function fuzzyJoinQuery(
  leftTable: string,
  leftColumn: string,
  rightTable: string,
  rightColumn: string,
  method: FuzzyMethod,
  threshold: number,
  outputTable: string,
  similarityColumn: string | undefined,
  rightSelect: string,
  prefilterPrefixLength?: number,
  deduplicate = false,
) {
  const leftExpression = `${quoteIdentifier(leftTable)}.${
    quoteIdentifier(leftColumn)
  }`;
  const rightExpression = `${quoteIdentifier(rightTable)}.${
    quoteIdentifier(rightColumn)
  }`;
  const { scoreExpression, condition } = buildFuzzyMatchSql(
    leftExpression,
    rightExpression,
    method,
    threshold,
    { decimals: 2, prefilterPrefixLength },
  );

  let cte = "";
  let from = `FROM ${quoteIdentifier(leftTable)} LEFT JOIN ${
    quoteIdentifier(rightTable)
  } ON ${condition}`;
  let score = scoreExpression;
  if (deduplicate) {
    const matches = quoteIdentifier(
      `__sda_fuzzy_matches_${crypto.randomUUID().replaceAll("-", "")}`,
    );
    const match = buildFuzzyMatchSql(
      "l.value",
      "r.value",
      method,
      threshold,
      { decimals: 2, prefilterPrefixLength },
    );
    // Keep the original value's collation for prefix matching, but use byte
    // keys for deduplication and expansion: fuzzy scores distinguish case even
    // when an input column has a case-insensitive collation.
    cte = `WITH ${matches} AS MATERIALIZED (
      SELECT l.key AS left_key, r.key AS right_key,
        ${match.scoreExpression} AS score
      FROM (
        SELECT DISTINCT ${quoteIdentifier(leftColumn)} AS value,
          ENCODE(${quoteIdentifier(leftColumn)}) AS key
        FROM ${quoteIdentifier(leftTable)}
        WHERE ${quoteIdentifier(leftColumn)} IS NOT NULL
      ) l
      INNER JOIN (
        SELECT DISTINCT ${quoteIdentifier(rightColumn)} AS value,
          ENCODE(${quoteIdentifier(rightColumn)}) AS key
        FROM ${quoteIdentifier(rightTable)}
        WHERE ${quoteIdentifier(rightColumn)} IS NOT NULL
      ) r ON ${match.condition}
    )`;
    from = `FROM ${quoteIdentifier(leftTable)}
      LEFT JOIN ${matches} ON ENCODE(${leftExpression}) = ${matches}.left_key
      LEFT JOIN ${quoteIdentifier(rightTable)}
        ON ENCODE(${rightExpression}) = ${matches}.right_key`;
    score = `${matches}.score`;
  }

  if (similarityColumn) {
    return `CREATE OR REPLACE TABLE ${quoteIdentifier(outputTable)} AS
${cte}
SELECT * EXCLUDE ("_sda_score"), "_sda_score" AS ${
      quoteIdentifier(similarityColumn)
    }
FROM (
  SELECT ${
      quoteIdentifier(leftTable)
    }.*, ${rightSelect}, ${score} AS "_sda_score"
  ${from}
) _sda
ORDER BY ${quoteIdentifier(leftColumn)}, "_sda_score" DESC;\n`;
  }

  return `CREATE OR REPLACE TABLE ${quoteIdentifier(outputTable)} AS
${cte}
SELECT *
FROM (
  SELECT ${quoteIdentifier(leftTable)}.*, ${rightSelect}
  ${from}
) _sda
ORDER BY ${quoteIdentifier(leftColumn)}, ${quoteIdentifier(rightColumn)};\n`;
}
