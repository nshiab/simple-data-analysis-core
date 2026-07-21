import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import capitalize from "../helpers/capitalize.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import findGeoColumn from "../helpers/findGeoColumn.ts";
import getIdenticalColumns from "../helpers/getIdenticalColumns.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";

export default function joinGeo(
  leftTable: SimpleTable,
  method: "intersect" | "inside" | "withinDistance",
  rightTable: SimpleTable,
  options: {
    leftColumn?: string;
    rightColumn?: string;
    type?: "inner" | "left" | "right" | "full";
    distance?: number;
    distanceMethod?: "srs" | "haversine" | "spheroid";
    outputTable?: string | boolean;
  } = {},
): SimpleTable {
  options = structuredClone(options);
  // The output table instance is created at call time so it can be returned
  // synchronously and chained on right away.
  const outputTable = typeof options.outputTable === "string"
    ? leftTable.sdb.newTable(options.outputTable)
    : leftTable;

  queueOp(outputTable, {
    kind: "barrier",
    method: "joinGeo()",
    parameters: { method, rightTable: rightTable.name, options },
    execute: () =>
      executeJoinGeo(leftTable, method, rightTable, outputTable, options),
  });

  return outputTable;
}

async function executeJoinGeo(
  leftTable: SimpleTable,
  method: "intersect" | "inside" | "withinDistance",
  rightTable: SimpleTable,
  outputTable: SimpleTable,
  options: {
    leftColumn?: string;
    rightColumn?: string;
    type?: "inner" | "left" | "right" | "full";
    distance?: number;
    distanceMethod?: "srs" | "haversine" | "spheroid";
  },
): Promise<void> {
  const leftColumn = options.leftColumn ??
    (await findGeoColumn(leftTable));
  const rightColumn = options.rightColumn ??
    (await findGeoColumn(rightTable));

  const sharedColumn = leftColumn === rightColumn ? leftColumn : "";
  const identicalColumns = (
    getIdenticalColumns(
      await leftTable.getColumns(),
      await rightTable.getColumns(),
    )
  ).filter((d) => d !== sharedColumn);
  if (identicalColumns.length > 0) {
    throw new Error(
      `The tables have columns with identical names ${
        sharedColumn !== ""
          ? `(excluding the columns ${
            quoteIdentifier(sharedColumn)
          } used for the geospatial join)`
          : ""
      }. Rename or remove ${
        identicalColumns.map((d) => `${quoteIdentifier(d)}`).join(", ")
      } in one of the two tables before doing the join.`,
    );
  }

  let leftColumnForQuery = leftColumn;
  let rightColumnForQuery = rightColumn;

  // We change the column names for geometries. renameColumnsNow runs
  // immediately, so it's safe inside this barrier.
  if (leftColumn === rightColumn) {
    leftColumnForQuery = `${leftColumn}${capitalize(leftTable.name)}`;
    await renameColumnNow(
      leftTable,
      leftColumn,
      leftColumnForQuery,
    );

    rightColumnForQuery = `${rightColumn}${capitalize(rightTable.name)}`;
    await renameColumnNow(
      rightTable,
      rightColumn,
      rightColumnForQuery,
    );
  }

  const type = options.type ?? "left";

  await queryDB(
    leftTable,
    joinGeoQuery(
      leftTable.name,
      leftColumnForQuery,
      method,
      rightTable.name,
      rightColumnForQuery,
      type,
      outputTable.name,
      options.distance,
      options.distanceMethod,
    ),
    mergeOptions(leftTable, {
      table: outputTable.name,
      method: "joinGeo()",
      parameters: {
        leftTable: leftTable.name,
        method,
        rightTable: rightTable.name,
        options,
      },
    }),
  );

  // We bring back the column names for geometries
  if (leftColumn === rightColumn) {
    await renameColumnNow(
      leftTable,
      leftColumnForQuery,
      leftColumn,
    );
    await renameColumnNow(
      rightTable,
      rightColumnForQuery,
      rightColumn,
    );
  }
}

async function renameColumnNow(
  table: SimpleTable,
  oldName: string,
  newName: string,
): Promise<void> {
  await queryDB(
    table,
    `ALTER TABLE ${quoteIdentifier(table.name)} RENAME COLUMN ${
      quoteIdentifier(oldName)
    } TO ${quoteIdentifier(newName)};`,
    mergeOptions(table, {
      table: table.name,
      method: "joinGeo()",
      parameters: { oldName, newName },
    }),
  );
}

function joinGeoQuery(
  leftTable: string,
  leftColumn: string,
  method: "intersect" | "inside" | "withinDistance",
  rightTable: string,
  rightColumn: string,
  join: "inner" | "left" | "right" | "full",
  outputTable: string,
  distance: number | undefined,
  distanceMethod: "srs" | "haversine" | "spheroid" | undefined,
) {
  let query = `CREATE OR REPLACE TABLE ${
    quoteIdentifier(outputTable)
  } AS SELECT *`;
  if (join === "inner") {
    query += ` FROM ${quoteIdentifier(leftTable)} JOIN ${
      quoteIdentifier(rightTable)
    }`;
  } else if (join === "left") {
    query += ` FROM ${quoteIdentifier(leftTable)} LEFT JOIN ${
      quoteIdentifier(rightTable)
    }`;
  } else if (join === "right") {
    query += ` FROM ${quoteIdentifier(leftTable)} RIGHT JOIN ${
      quoteIdentifier(rightTable)
    }`;
  } else if (join === "full") {
    query += ` FROM ${quoteIdentifier(leftTable)} FULL JOIN ${
      quoteIdentifier(rightTable)
    }`;
  } else {
    throw new Error(`Unknown ${join} join.`);
  }

  if (method === "intersect") {
    query += ` ON ST_Intersects(${quoteIdentifier(leftTable)}.${
      quoteIdentifier(leftColumn)
    }, ${quoteIdentifier(rightTable)}.${quoteIdentifier(rightColumn)});`;
  } else if (method === "inside") {
    // Order is important
    query += ` ON ST_Covers(${quoteIdentifier(rightTable)}.${
      quoteIdentifier(rightColumn)
    }, ${quoteIdentifier(leftTable)}.${quoteIdentifier(leftColumn)});`;
  } else if (method === "withinDistance") {
    if (typeof distance === "number") {
      if (distanceMethod === undefined || distanceMethod === "srs") {
        query += ` ON ST_DWithin(${quoteIdentifier(leftTable)}.${
          quoteIdentifier(leftColumn)
        }, ${quoteIdentifier(rightTable)}.${
          quoteIdentifier(rightColumn)
        }, ${distance})`;
      } else if (distanceMethod === "haversine") {
        // Maybe ST_DWithin_Sphere will be available soon?
        query += ` ON ST_Distance_Sphere(${quoteIdentifier(leftTable)}.${
          quoteIdentifier(leftColumn)
        }, ${quoteIdentifier(rightTable)}.${
          quoteIdentifier(rightColumn)
        }) < ${distance}`;
      } else if (distanceMethod === "spheroid") {
        // Should be using ST_DWithin_Spheroid but doesn't work?
        query += ` ON ST_Distance_Spheroid(${quoteIdentifier(leftTable)}.${
          quoteIdentifier(leftColumn)
        }::GEOMETRY, ${quoteIdentifier(rightTable)}.${
          quoteIdentifier(rightColumn)
        }::GEOMETRY) < ${distance}`;
      } else {
        throw new Error(`Unknown ${distanceMethod}`);
      }
    } else {
      throw new Error("options.distance must be a number");
    }
  } else {
    throw new Error(`Unknown ${method} method`);
  }

  return query;
}
