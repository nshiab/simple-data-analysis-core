import type SimpleTable from "../class/SimpleTable.ts";
import computeCovariance from "../helpers/computeCovariance.ts";
import computeMahalanobisDistances from "../helpers/computeMahalanobisDistances.ts";
import foldIdentifier from "../helpers/foldIdentifier.ts";
import prepareNumericFeatures from "../helpers/prepareNumericFeatures.ts";
import publishPreparedColumns from "../helpers/publishPreparedColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";

type Options = NonNullable<Parameters<SimpleTable["mahalanobis"]>[3]>;

export default function mahalanobis(
  table: SimpleTable,
  columns: string | string[],
  referencePoint: number[],
  newColumn: string,
  options: Options = {},
): void {
  if (
    !Array.isArray(referencePoint) || referencePoint.length === 0 ||
    Array.from(referencePoint).some((value) =>
      typeof value !== "number" || !Number.isFinite(value)
    )
  ) {
    throw new Error(
      "mahalanobis() referencePoint must be a nonempty array of finite numbers in feature-dimension order.",
    );
  }
  const selected = typeof columns === "string" ? columns : [...columns];
  const reference = [...referencePoint];
  const settings = { ...options };
  queueOp(table, {
    kind: "barrier",
    method: "mahalanobis()",
    parameters: {
      columns: selected,
      referencePoint: reference,
      newColumn,
      options: settings,
    },
    execute: () => execute(table, selected, reference, newColumn, settings),
  });
}

async function execute(
  table: SimpleTable,
  columns: string | string[],
  referencePoint: number[],
  newColumn: string,
  options: Options,
): Promise<void> {
  const sourceColumns = Object.keys(await table.getTypes());
  const outputNames = options.similarityScoreColumn === undefined
    ? [newColumn]
    : [newColumn, options.similarityScoreColumn];
  const seen = new Set<string>();
  for (const name of outputNames) {
    if (typeof name !== "string" || name.length === 0 || name.includes("\0")) {
      throw new Error(
        "mahalanobis() output column names must be nonempty strings without null characters.",
      );
    }
    const folded = foldIdentifier(name);
    if (seen.has(folded)) {
      throw new Error(
        "mahalanobis() distance and similarity score columns must have different names (case-insensitive).",
      );
    }
    seen.add(folded);
    if (sourceColumns.some((column) => foldIdentifier(column) === folded)) {
      throw new Error(
        `mahalanobis() cannot create ${
          quoteIdentifier(name)
        } because that column already exists. Remove it first or choose a different name.`,
      );
    }
  }

  const prepared = await prepareNumericFeatures(
    table,
    typeof columns === "string"
      ? { kind: "vector", column: columns }
      : { kind: "scalars", columns },
    { method: "mahalanobis()" },
  );
  try {
    if (referencePoint.length !== prepared.dimensions) {
      throw new Error(
        `mahalanobis() referencePoint must contain ${prepared.dimensions} values in feature-dimension order; received ${referencePoint.length}.`,
      );
    }
    const model = await computeCovariance(table.connection!, {
      relation: prepared.relation,
      rowIdColumn: prepared.rowIdColumn,
      vectorColumn: prepared.vectorColumn,
      observations: prepared.rowCount,
      dimensions: prepared.dimensions,
    });
    const distances = await computeMahalanobisDistances(
      table.connection!,
      {
        relation: prepared.relation,
        rowIdColumn: prepared.rowIdColumn,
        vectorColumn: prepared.vectorColumn,
      },
      model,
      referencePoint,
    );
    try {
      const distance = `r.${quoteIdentifier(distances.distanceColumn)}`;
      const outputs = [{ name: newColumn, expression: distance }];
      if (options.similarityScoreColumn !== undefined) {
        outputs.push({
          name: options.similarityScoreColumn,
          expression:
            `CASE WHEN max(${distance}) OVER () = 0 THEN 1::DOUBLE ELSE 1 - ${distance} / max(${distance}) OVER () END`,
        });
      }
      await publishPreparedColumns(table, prepared, {
        method: "mahalanobis()",
        parameters: { columns, referencePoint, newColumn, options },
        result: {
          relation: distances.relation,
          rowIdColumn: distances.rowIdColumn,
        },
        outputs,
      });
    } finally {
      await distances.cleanup();
    }
  } finally {
    await prepared.cleanup();
  }
}
