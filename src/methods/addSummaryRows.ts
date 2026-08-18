import assertColumnsExist from "../helpers/assertColumnsExist.ts";
import getStatExpression, {
  allStats,
  type Stat,
} from "../helpers/getStatExpression.ts";
import keepNumericalColumns from "../helpers/keepNumericalColumns.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

type StatRowOperation = Exclude<Stat, "count">;
type StatRow =
  | StatRowOperation
  | { stat: StatRowOperation; label?: string };
type NormalizedStatRow = { stat: StatRowOperation; label: string };
type AddSummaryRowsOptions = {
  stats?: StatRow | StatRow[];
  position?: "top" | "bottom";
};

const allStatRowOperations = allStats.filter(
  (stat): stat is StatRowOperation => stat !== "count",
);

export default function addSummaryRows(
  simpleTable: SimpleTable,
  columns: "all" | string | string[],
  labelColumn: string,
  options: AddSummaryRowsOptions = {},
) {
  options = structuredClone(options);
  if (
    options.position !== undefined &&
    options.position !== "top" &&
    options.position !== "bottom"
  ) {
    throw new Error(
      `addSummaryRows() options.position must be "top" or "bottom". Received ${
        JSON.stringify(options.position)
      }.`,
    );
  }
  const selectedColumns = columns === "all" ? "all" : stringToArray(columns);
  if (selectedColumns !== "all" && selectedColumns.length === 0) {
    throw new Error(
      'addSummaryRows() requires at least one column or "all".',
    );
  }
  if (selectedColumns !== "all") {
    const duplicates = selectedColumns.filter((column, index) =>
      selectedColumns.indexOf(column) !== index
    );
    if (duplicates.length > 0) {
      throw new Error(
        `addSummaryRows() received duplicate column${
          new Set(duplicates).size === 1 ? "" : "s"
        } ${[...new Set(duplicates)].map(quoteIdentifier).join(", ")}.`,
      );
    }
    if (selectedColumns.includes(labelColumn)) {
      throw new Error(
        `addSummaryRows() label column ${
          quoteIdentifier(labelColumn)
        } cannot also be summarized.`,
      );
    }
  }

  const statRows = normalizeStatRows(options.stats);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "addSummaryRows()",
    parameters: { columns, labelColumn, options },
    needsSchema: true,
    values: statRows.map((row) => row.label),
    buildSelect: (input, schema) =>
      addSummaryRowsSelect(
        input,
        schema,
        selectedColumns,
        labelColumn,
        statRows,
        options.position ?? "bottom",
      ),
  });
}

function normalizeStatRows(
  stats?: StatRow | StatRow[],
): NormalizedStatRow[] {
  const rows = stats === undefined
    ? [...allStatRowOperations]
    : Array.isArray(stats)
    ? stats
    : [stats];
  if (rows.length === 0) {
    throw new Error(
      "addSummaryRows() stats cannot be an empty array. Omit stats to add every supported stat.",
    );
  }

  return rows.map((row) => {
    if (typeof row === "string") {
      assertStat(row);
      return { stat: row, label: row };
    }
    if (row === null || typeof row !== "object") {
      throw new Error(
        "addSummaryRows() stats must contain stat names or objects with a stat property.",
      );
    }
    assertStat(row.stat);
    if (row.label !== undefined && typeof row.label !== "string") {
      throw new Error("addSummaryRows() stat labels must be strings.");
    }
    return { stat: row.stat, label: row.label ?? row.stat };
  });
}

function assertStat(
  stat: string,
): asserts stat is StatRowOperation {
  if (!(allStatRowOperations as readonly string[]).includes(stat)) {
    throw new Error(
      `addSummaryRows() stat ${JSON.stringify(stat)} is not supported. Use ${
        allStatRowOperations.map((value) => JSON.stringify(value)).join(", ")
      }.`,
    );
  }
}

function addSummaryRowsSelect(
  input: string,
  schema: TableSchema,
  columns: "all" | string[],
  labelColumn: string,
  statRows: NormalizedStatRow[],
  position: "top" | "bottom",
): string {
  const method = "addSummaryRows()";
  const tableColumns = Object.keys(schema);
  assertColumnsExist(schema, [labelColumn], method);
  if (schema[labelColumn] !== "VARCHAR") {
    throw new Error(
      `${method} label column ${
        quoteIdentifier(labelColumn)
      } must have type VARCHAR, but has type ${schema[labelColumn]}.`,
    );
  }

  const numericalColumns = keepNumericalColumns(schema);
  const selectedColumns = columns === "all" ? numericalColumns : columns;
  if (selectedColumns.length === 0) {
    throw new Error(
      `${method} could not find any numeric columns. Select numeric columns explicitly or convert columns to numeric types first.`,
    );
  }
  if (columns !== "all") {
    assertColumnsExist(schema, selectedColumns, method);
    const numericalColumnSet = new Set(numericalColumns);
    const nonNumericalColumns = selectedColumns.filter((column) =>
      !numericalColumnSet.has(column)
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
  }

  const selectedColumnSet = new Set(selectedColumns);
  const kindColumn = unusedColumn(schema, "_sda_stat_kind");
  const orderColumn = unusedColumn(
    { ...schema, [kindColumn]: "INTEGER" },
    "_sda_stat_order",
  );
  const projectedColumns = tableColumns.map(quoteIdentifier).join(", ");
  const dataKind = position === "top" ? 1 : 0;
  const statKind = position === "top" ? 0 : 1;
  const branches = [
    `SELECT ${projectedColumns}, ${dataKind} AS ${
      quoteIdentifier(kindColumn)
    }, ROW_NUMBER() OVER () AS ${quoteIdentifier(orderColumn)} FROM ${input}`,
    ...statRows.map((row, index) => {
      const projections = tableColumns.map((column) => {
        if (column === labelColumn) {
          return `CAST(? AS VARCHAR) AS ${quoteIdentifier(column)}`;
        }
        if (!selectedColumnSet.has(column)) {
          return `NULL AS ${quoteIdentifier(column)}`;
        }
        const expression = getStatExpression(
          row.stat,
          schema[column],
          quoteIdentifier(column),
          undefined,
        );
        if (expression === null) {
          throw new Error(
            `${method} stat ${
              JSON.stringify(row.stat)
            } cannot be computed for column ${
              quoteIdentifier(column)
            } with type ${schema[column]}.`,
          );
        }
        return `${expression} AS ${quoteIdentifier(column)}`;
      });
      return `SELECT ${projections.join(", ")}, ${statKind} AS ${
        quoteIdentifier(kindColumn)
      }, ${index} AS ${quoteIdentifier(orderColumn)} FROM ${input}`;
    }),
  ];

  return `SELECT ${projectedColumns}
FROM (${branches.join("\nUNION ALL\n")}) AS ${quoteIdentifier("stats")}
ORDER BY ${quoteIdentifier(kindColumn)}, ${quoteIdentifier(orderColumn)}`;
}

function unusedColumn(schema: TableSchema, base: string): string {
  let column = base;
  while (schema[column] !== undefined) {
    column += "_";
  }
  return column;
}
