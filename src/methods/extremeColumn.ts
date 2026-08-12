import assertColumnsExist from "../helpers/assertColumnsExist.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import keepNumericalColumns from "../helpers/keepNumericalColumns.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export type ExtremeColumnOptions = {
  ties?: "strict" | "first" | "all";
};

type Extreme = "highest" | "lowest";

export default function extremeColumn(
  simpleTable: SimpleTable,
  columns: string[],
  newColumn: string,
  extreme: Extreme,
  options: ExtremeColumnOptions = {},
) {
  columns = [...columns];
  options = structuredClone(options);
  const method = `${extreme}Column()`;
  const ties = options.ties ?? "strict";

  if (columns.length === 0) {
    throw new Error(`${method} requires at least one column.`);
  }

  const duplicateColumns = columns.filter((column, index) =>
    columns.indexOf(column) !== index
  );
  if (duplicateColumns.length > 0) {
    const duplicates = [...new Set(duplicateColumns)];
    throw new Error(
      `${method} received duplicate column${
        duplicates.length === 1 ? "" : "s"
      } ${
        duplicates.map(quoteIdentifier).join(", ")
      }. Include each column only once.`,
    );
  }

  const validTieOptions = new Set<string>(["strict", "first", "all"]);
  if (!validTieOptions.has(ties)) {
    throw new Error(
      `${method} options.ties must be "strict", "first", or "all".`,
    );
  }

  queueOp(simpleTable, {
    kind: "fusable",
    method,
    parameters: { columns, newColumn, options },
    needsSchema: true,
    values: columns,
    buildSelect: (input, schema) =>
      extremeColumnSelect(
        input,
        schema,
        columns,
        newColumn,
        extreme,
        ties,
      ),
  });
}

function extremeColumnSelect(
  input: string,
  schema: TableSchema,
  columns: string[],
  newColumn: string,
  extreme: Extreme,
  ties: "strict" | "first" | "all",
): string {
  const method = `${extreme}Column()`;
  assertColumnsExist(schema, columns, method);
  assertNewColumns(schema, [newColumn], method);

  const numericalColumns = new Set(keepNumericalColumns(schema));
  const nonNumericalColumns = columns.filter((column) =>
    !numericalColumns.has(column)
  );
  if (nonNumericalColumns.length > 0) {
    throw new Error(
      `${method} requires numeric columns, but ${
        nonNumericalColumns.map((column) =>
          `${quoteIdentifier(column)} has type ${schema[column]}`
        ).join(", ")
      }. Convert ${
        nonNumericalColumns.length === 1 ? "it" : "them"
      } to a numeric type first.`,
    );
  }

  const candidates = columns.map((column, index) =>
    `(?, ${quoteIdentifier(column)}, ${index})`
  ).join(",\n      ");
  const aggregate = extreme === "highest" ? "MAX" : "MIN";
  const tied = `WITH candidates(name, value, position) AS (
      VALUES ${candidates}
    ),
    tied AS (
      SELECT name, position
      FROM candidates
      WHERE value IS NOT NULL
      QUALIFY value = ${aggregate}(value) OVER ()
    )`;

  let selection: string;
  if (ties === "all") {
    selection = `${tied}
    SELECT name AS selected_column
    FROM tied
    ORDER BY position`;
  } else if (ties === "first") {
    selection = `${tied}
    SELECT FIRST(name ORDER BY position) AS selected_column
    FROM tied`;
  } else {
    selection = `${tied}
    SELECT CASE
      WHEN COUNT(*) > 1 THEN error(CONCAT(
        '${method} found a tie between columns ',
        STRING_AGG(CONCAT('"', REPLACE(name, '"', '""'), '"'), ', ' ORDER BY position),
        '. Use { ties: "first" } to select the first tied column, or { ties: "all" } to produce one row for each tied column.'
      ))
      ELSE FIRST(name ORDER BY position)
    END AS selected_column
    FROM tied`;
  }

  return `SELECT source.*, selected.selected_column AS ${
    quoteIdentifier(newColumn)
  }
FROM ${input} AS source
LEFT JOIN LATERAL (
  ${selection}
) AS selected ON TRUE`;
}
