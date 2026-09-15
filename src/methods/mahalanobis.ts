import type SimpleTable from "../class/SimpleTable.ts";
import computeCovariance from "../helpers/computeCovariance.ts";
import computeMahalanobisDistances from "../helpers/computeMahalanobisDistances.ts";
import foldIdentifier from "../helpers/foldIdentifier.ts";
import prepareNumericFeatures from "../helpers/prepareNumericFeatures.ts";
import publishPreparedColumns from "../helpers/publishPreparedColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";

export default function mahalanobis(
  table: SimpleTable,
  columns: string | string[],
  newColumn: string,
): void {
  const selected = typeof columns === "string" ? columns : [...columns];
  queueOp(table, {
    kind: "barrier",
    method: "mahalanobis()",
    parameters: { columns: selected, newColumn },
    execute: () => execute(table, selected, newColumn),
  });
}

async function execute(
  table: SimpleTable,
  columns: string | string[],
  newColumn: string,
): Promise<void> {
  const sourceColumns = Object.keys(await table.getTypes());
  if (
    sourceColumns.some((column) =>
      foldIdentifier(column) === foldIdentifier(newColumn)
    )
  ) {
    throw new Error(
      `mahalanobis() cannot create ${
        quoteIdentifier(newColumn)
      } because that column already exists. Remove it first or choose a different name.`,
    );
  }

  const prepared = await prepareNumericFeatures(
    table,
    typeof columns === "string"
      ? { kind: "vector", column: columns }
      : { kind: "scalars", columns },
    { method: "mahalanobis()" },
  );
  try {
    const model = await computeCovariance(table.connection!, {
      relation: prepared.relation,
      rowIdColumn: prepared.rowIdColumn,
      vectorColumn: prepared.vectorColumn,
      observations: prepared.rowCount,
      dimensions: prepared.dimensions,
    });
    const distances = await computeMahalanobisDistances(table.connection!, {
      relation: prepared.relation,
      rowIdColumn: prepared.rowIdColumn,
      vectorColumn: prepared.vectorColumn,
    }, model);
    try {
      await publishPreparedColumns(table, prepared, {
        method: "mahalanobis()",
        parameters: { columns, newColumn },
        result: {
          relation: distances.relation,
          rowIdColumn: distances.rowIdColumn,
        },
        outputs: [{
          name: newColumn,
          expression: `r.${quoteIdentifier(distances.distanceColumn)}`,
        }],
      });
    } finally {
      await distances.cleanup();
    }
  } finally {
    await prepared.cleanup();
  }
}
