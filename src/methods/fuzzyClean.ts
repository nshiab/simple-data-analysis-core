import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import { DuckDBListValue } from "@duckdb/node-api";
import type SimpleTable from "../class/SimpleTable.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import buildFuzzyMatchSql from "../helpers/buildFuzzyMatchSql.ts";
import selectFuzzyReplacements, {
  type FuzzyPair,
} from "../helpers/selectFuzzyReplacements.ts";

export default function fuzzyClean(
  table: SimpleTable,
  column: string,
  newColumn: string,
  threshold: number,
  options: {
    method?:
      | "ratio"
      | "partial_ratio"
      | "token_sort_ratio"
      | "token_set_ratio";
    strategy?:
      | "mostCommon"
      | "longestString"
      | "shortestString"
      | "mostCentral"
      | "maxScore";
    prefilterPrefixLength?: number;
  } = {},
): void {
  // This implementation clusters fuzzy pairs in JS and writes the mapping
  // back to DuckDB, so it executes as a barrier.
  options = structuredClone(options);
  queueOp(table, {
    kind: "barrier",
    method: "fuzzyClean()",
    parameters: { column, newColumn, threshold, options },
    execute: () =>
      executeFuzzyClean(table, column, newColumn, threshold, options),
  });
}

async function executeFuzzyClean(
  table: SimpleTable,
  column: string,
  newColumn: string,
  threshold: number,
  options: {
    method?:
      | "ratio"
      | "partial_ratio"
      | "token_sort_ratio"
      | "token_set_ratio";
    strategy?:
      | "mostCommon"
      | "longestString"
      | "shortestString"
      | "mostCentral"
      | "maxScore";
    prefilterPrefixLength?: number;
  } = {},
): Promise<void> {
  const method = options.method ?? "ratio";
  const strategy = options.strategy ?? "mostCommon";
  const { scoreExpression, condition } = buildFuzzyMatchSql(
    "a.value",
    "b.value",
    method,
    threshold,
    { prefilterPrefixLength: options.prefilterPrefixLength },
  );

  // Compute fuzzy pairs and embed counts for both sides. Only values that
  // appear in at least one pair above the threshold can be normalized —
  // singletons need no processing at all.
  const pairsData = await queryDB(
    table,
    `INSTALL rapidfuzz FROM community; LOAD rapidfuzz;
     WITH uniques AS (
       SELECT ${quoteIdentifier(column)} AS value, COUNT(*) AS cnt
       FROM ${quoteIdentifier(table.name)}
       WHERE ${quoteIdentifier(column)} IS NOT NULL
       GROUP BY ${quoteIdentifier(column)}
     )
     SELECT
       a.value AS left_value,
       b.value AS right_value,
       a.cnt   AS left_cnt,
       b.cnt   AS right_cnt,
       ${scoreExpression} AS score
     FROM uniques a
     JOIN uniques b
       ON ${condition}
       AND a.value < b.value`,
    mergeOptions(table, {
      table: table.name,
      method: "fuzzyClean()",
      parameters: { column, newColumn, threshold, options },
      returnData: true,
    }),
  ) as
    | FuzzyPair[]
    | null;

  const pairs = pairsData ?? [];
  if (pairs.length === 0) {
    if (newColumn !== column) {
      await queryDB(
        table,
        `ALTER TABLE ${quoteIdentifier(table.name)} ADD ${
          quoteIdentifier(newColumn)
        } VARCHAR;
         UPDATE ${quoteIdentifier(table.name)}
           SET ${quoteIdentifier(newColumn)} = ${quoteIdentifier(column)};`,
        mergeOptions(table, {
          table: table.name,
          method: "fuzzyClean()",
          parameters: { column, newColumn, threshold, options },
        }),
      );
    }
    return;
  }

  const replacement = selectFuzzyReplacements(pairs, strategy);

  if (replacement.size === 0) return;

  // Two bound lists keep the SQL and parameter count fixed as the mapping
  // grows. Side-by-side UNNEST zips the equally sized lists into mapping rows,
  // which DuckDB can hash-join to the original table.
  const values = [
    new DuckDBListValue([...replacement.keys()]),
    new DuckDBListValue([...replacement.values()]),
  ];
  const mapping = `WITH mapping(original, canonical) AS (
    SELECT UNNEST(?::VARCHAR[]), UNNEST(?::VARCHAR[])
  )`;

  const query = newColumn !== column
    ? `ALTER TABLE ${quoteIdentifier(table.name)} ADD ${
      quoteIdentifier(newColumn)
    } VARCHAR;
       UPDATE ${quoteIdentifier(table.name)}
         SET ${quoteIdentifier(newColumn)} = ${quoteIdentifier(column)};
       ${mapping}
       UPDATE ${quoteIdentifier(table.name)}
         SET ${quoteIdentifier(newColumn)} = m.canonical
         FROM mapping m
         WHERE ${quoteIdentifier(table.name)}.${
      quoteIdentifier(newColumn)
    } = m.original`
    : `${mapping}
       UPDATE ${quoteIdentifier(table.name)}
         SET ${quoteIdentifier(column)} = m.canonical
         FROM mapping m
         WHERE ${quoteIdentifier(table.name)}.${
      quoteIdentifier(column)
    } = m.original`;

  await queryDB(
    table,
    query,
    mergeOptions(table, {
      table: table.name,
      method: "fuzzyClean()",
      parameters: { column, newColumn, options },
      values,
    }),
  );
}
