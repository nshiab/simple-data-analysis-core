import type SimpleTable from "../class/SimpleTable.ts";
import queueOp from "../helpers/queueOp.ts";

export default function normalizeString(
  simpleTable: SimpleTable,
  column: string,
  newColumn: string,
  options: { stripPunctuation?: boolean } = {},
): void {
  const { stripPunctuation = true } = options;

  const accentRemoved = `strip_accents("${column}")`;

  const lowercased = `lower(${accentRemoved})`;

  const punctuationRemoved = stripPunctuation
    ? `regexp_replace(${lowercased}, '[[:punct:]]', '', 'g')`
    : lowercased;

  const normalizedClause =
    `trim(regexp_replace(${punctuationRemoved}, '\\s+', ' ', 'g'))`;

  queueOp(simpleTable, {
    kind: "fusable",
    method: "normalizeString()",
    parameters: { column, newColumn, stripPunctuation },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT *,
      CASE
        WHEN "${column}" IS NULL THEN NULL
        ELSE ${normalizedClause}
      END AS "${newColumn}"
    FROM ${input}`,
  });
}
