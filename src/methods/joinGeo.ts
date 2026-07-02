import capitalize from "../helpers/capitalize.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import findGeoColumn from "../helpers/findGeoColumn.ts";
import getIdenticalColumns from "../helpers/getIdenticalColumns.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";

export default async function joinGeo(
  leftTable: SimpleTable,
  method: "intersect" | "inside" | "within",
  rightTable: SimpleTable,
  options: {
    leftTableColumn?: string;
    rightTableColumn?: string;
    type?: "inner" | "left" | "right" | "full";
    distance?: number;
    distanceMethod?: "srs" | "haversine" | "spheroid";
    outputTable?: string | boolean;
  } = {},
) {
  const leftTableColumn = options.leftTableColumn ??
    (await findGeoColumn(leftTable));
  const rightTableColumn = options.rightTableColumn ??
    (await findGeoColumn(rightTable));

  const commonColumn = leftTableColumn === rightTableColumn
    ? leftTableColumn
    : "";
  const identicalColumns = (
    getIdenticalColumns(
      await leftTable.getColumns(),
      await rightTable.getColumns(),
    )
  ).filter((d) => d !== commonColumn);
  if (identicalColumns.length > 0) {
    throw new Error(
      `The tables have columns with identical names ${
        commonColumn !== ""
          ? `(excluding the columns "${commonColumn}" used for the geospatial join)`
          : ""
      }. Rename or remove ${
        identicalColumns.map((d) => `"${d}"`).join(", ")
      } in one of the two tables before doing the join.`,
    );
  }

  let leftTableColumnForQuery = leftTableColumn;
  let rightTableColumnForQuery = rightTableColumn;

  // We change the column names for geometries
  if (leftTableColumn === rightTableColumn) {
    leftTableColumnForQuery = `${leftTableColumn}${capitalize(leftTable.name)}`;
    const leftObj: { [key: string]: string } = {};
    leftObj[leftTableColumn] = leftTableColumnForQuery;
    await leftTable.renameColumns(leftObj);

    rightTableColumnForQuery = `${rightTableColumn}${
      capitalize(rightTable.name)
    }`;
    const rightObj: { [key: string]: string } = {};
    rightObj[rightTableColumn] = rightTableColumnForQuery;
    await rightTable.renameColumns(rightObj);
  }

  const type = options.type ?? "left";
  const outputTable = typeof options.outputTable === "string"
    ? options.outputTable
    : leftTable.name;

  await queryDB(
    leftTable,
    joinGeoQuery(
      leftTable.name,
      leftTableColumnForQuery,
      method,
      rightTable.name,
      rightTableColumnForQuery,
      type,
      outputTable,
      options.distance,
      options.distanceMethod,
    ),
    mergeOptions(leftTable, {
      table: outputTable,
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
  if (leftTableColumn === rightTableColumn) {
    const leftObj: { [key: string]: string } = {};
    leftObj[leftTableColumnForQuery] = leftTableColumn;
    await leftTable.renameColumns(leftObj);

    const rightObj: { [key: string]: string } = {};
    rightObj[rightTableColumnForQuery] = rightTableColumn;
    await rightTable.renameColumns(rightObj);
  }

  if (typeof options.outputTable === "string") {
    return leftTable.sdb.newTable(options.outputTable);
  } else {
    return leftTable;
  }
}

function joinGeoQuery(
  leftTable: string,
  leftTableColumn: string,
  method: "intersect" | "inside" | "within",
  rightTable: string,
  rightTableColumn: string,
  join: "inner" | "left" | "right" | "full",
  outputTable: string,
  distance: number | undefined,
  distanceMethod: "srs" | "haversine" | "spheroid" | undefined,
) {
  let query = `CREATE OR REPLACE TABLE "${outputTable}" AS SELECT *`;
  if (join === "inner") {
    query += ` FROM "${leftTable}" JOIN "${rightTable}"`;
  } else if (join === "left") {
    query += ` FROM "${leftTable}" LEFT JOIN "${rightTable}"`;
  } else if (join === "right") {
    query += ` FROM "${leftTable}" RIGHT JOIN "${rightTable}"`;
  } else if (join === "full") {
    query += ` FROM "${leftTable}" FULL JOIN "${rightTable}"`;
  } else {
    throw new Error(`Unknown ${join} join.`);
  }

  if (method === "intersect") {
    query +=
      ` ON ST_Intersects("${leftTable}"."${leftTableColumn}", "${rightTable}"."${rightTableColumn}");`;
  } else if (method === "inside") {
    // Order is important
    query +=
      ` ON ST_Covers("${rightTable}"."${rightTableColumn}", "${leftTable}"."${leftTableColumn}");`;
  } else if (method === "within") {
    if (typeof distance === "number") {
      if (distanceMethod === undefined || distanceMethod === "srs") {
        query +=
          ` ON ST_DWithin("${leftTable}"."${leftTableColumn}", "${rightTable}"."${rightTableColumn}", ${distance})`;
      } else if (distanceMethod === "haversine") {
        // Maybe ST_DWithin_Sphere will be available soon?
        query +=
          ` ON ST_Distance_Sphere("${leftTable}"."${leftTableColumn}", "${rightTable}"."${rightTableColumn}") < ${distance}`;
      } else if (distanceMethod === "spheroid") {
        // Should be using ST_DWithin_Spheroid but doesn't work?
        query +=
          ` ON ST_Distance_Spheroid("${leftTable}"."${leftTableColumn}"::GEOMETRY, "${rightTable}"."${rightTableColumn}"::GEOMETRY) < ${distance}`;
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
