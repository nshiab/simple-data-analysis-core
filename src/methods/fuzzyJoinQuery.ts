export default function fuzzyJoinQuery(
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

  if (method === "ratio" || method === "token_sort_ratio") {
    const preFilterLenDiffRatio = (100 - threshold) / 100;
    onClause +=
      ` AND ABS(LENGTH("${leftTable}"."${leftColumn}") - LENGTH("${rightTable}"."${rightColumn}")) <= ${preFilterLenDiffRatio} * GREATEST(LENGTH("${leftTable}"."${leftColumn}"), LENGTH("${rightTable}"."${rightColumn}"))`;
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
