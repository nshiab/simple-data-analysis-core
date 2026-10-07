import type SimpleTable from "../class/SimpleTable.ts";
import computeCovariance from "../helpers/computeCovariance.ts";
import computeMahalanobisDistances from "../helpers/computeMahalanobisDistances.ts";
import foldIdentifier from "../helpers/foldIdentifier.ts";
import prepareNumericFeatures from "../helpers/prepareNumericFeatures.ts";
import publishPreparedColumns from "../helpers/publishPreparedColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";

type Options = NonNullable<Parameters<SimpleTable["similarityMahalanobis"]>[3]>;

export default function similarityMahalanobis(
  table: SimpleTable,
  columns: string | string[],
  referencePoint: number[] | { [key: string]: unknown },
  newColumn: string,
  options: Options = {},
): void {
  const selected = typeof columns === "string" ? columns : [...columns];
  if (
    !Array.isArray(referencePoint) && referencePoint !== null &&
    typeof referencePoint === "object"
  ) {
    if (typeof selected === "string") {
      throw new Error(
        "similarityMahalanobis() an object referencePoint requires an array of scalar feature column names; use a numeric array for a vector column.",
      );
    }
    const referenceObject = referencePoint;
    referencePoint = selected.map((column) => {
      if (!Object.hasOwn(referenceObject, column)) {
        throw new Error(
          `similarityMahalanobis() referencePoint is missing its own value for feature ${
            quoteIdentifier(column)
          }.`,
        );
      }
      const value = referenceObject[column];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(
          `similarityMahalanobis() referencePoint feature ${
            quoteIdentifier(column)
          } must be a finite number.`,
        );
      }
      return value;
    });
  }
  if (
    !Array.isArray(referencePoint) || referencePoint.length === 0 ||
    Array.from(referencePoint).some((value) =>
      typeof value !== "number" || !Number.isFinite(value)
    )
  ) {
    throw new Error(
      "similarityMahalanobis() referencePoint must be a nonempty array of finite numbers in feature-dimension order.",
    );
  }
  const reference = [...referencePoint];
  const settings = { ...options };
  queueOp(table, {
    kind: "barrier",
    method: "similarityMahalanobis()",
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
  const scoreColumn = options.similarityColumn === true
    ? "similarity"
    : options.similarityColumn === false
    ? undefined
    : options.similarityColumn;
  const outputNames = scoreColumn === undefined
    ? [newColumn]
    : [newColumn, scoreColumn];
  const seen = new Set<string>();
  for (const name of outputNames) {
    if (typeof name !== "string" || name.length === 0 || name.includes("\0")) {
      throw new Error(
        "similarityMahalanobis() output column names must be nonempty strings without null characters.",
      );
    }
    const folded = foldIdentifier(name);
    if (seen.has(folded)) {
      throw new Error(
        "similarityMahalanobis() distance and similarity score columns must have different names (case-insensitive).",
      );
    }
    seen.add(folded);
    if (sourceColumns.some((column) => foldIdentifier(column) === folded)) {
      throw new Error(
        `similarityMahalanobis() cannot create ${
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
    { method: "similarityMahalanobis()" },
  );
  try {
    if (referencePoint.length !== prepared.dimensions) {
      throw new Error(
        `similarityMahalanobis() referencePoint must contain ${prepared.dimensions} values in feature-dimension order; received ${referencePoint.length}.`,
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
      if (scoreColumn !== undefined) {
        outputs.push({
          name: scoreColumn,
          expression:
            `CASE WHEN max(${distance}) OVER () = 0 THEN 1::DOUBLE ELSE 1 - ${distance} / max(${distance}) OVER () END`,
        });
      }
      await publishPreparedColumns(table, prepared, {
        method: "similarityMahalanobis()",
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
