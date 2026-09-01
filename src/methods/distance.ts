import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function distance(
  simpleTable: SimpleTable,
  column1: string,
  column2: string,
  newColumn: string,
  options: {
    unit?: "m" | "km";
    method?: "srs" | "haversine" | "spheroid";
    decimals?: number;
  } = {},
) {
  // Building the expression doesn't need the database, so invalid options
  // throw at call time.
  const expression = distanceExpression(column1, column2, options);

  queueOp(simpleTable, {
    kind: "fusable",
    method: "distance()",
    parameters: { column1, column2, newColumn },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      assertNewColumns(types, [newColumn], "distance()");
      return `SELECT *, CAST(${expression} AS DOUBLE) AS ${
        quoteIdentifier(newColumn)
      } FROM ${input}`;
    },
  });
}

function distanceExpression(
  column1: string,
  column2: string,
  options: {
    unit?: "m" | "km";
    method?: "srs" | "spheroid" | "haversine";
    decimals?: number;
  } = {},
) {
  options = structuredClone(options);
  options.method = options.method ?? "srs";

  if (options.method === "srs" && typeof options.unit === "string") {
    throw new Error(
      "Using the SRS unit. You can't specify options.unit unless you set options.method to 'spheroid' or 'haversine'.",
    );
  } else if (["spheroid", "haversine"].includes(options.method)) {
    options.unit = options.unit ?? "m";
    if (!["m", "km"].includes(options.unit)) {
      throw new Error(
        `Unknown unit ${options.unit}. Choose between 'm' and 'km'.`,
      );
    }
  }

  let expression = "";
  if (options.method === "srs") {
    expression = `ST_Distance(${quoteIdentifier(column1)}, ${
      quoteIdentifier(column2)
    })`;
  } else if (options.method === "haversine") {
    expression = `ST_Distance_Sphere(${quoteIdentifier(column1)}, ${
      quoteIdentifier(column2)
    }) ${options.unit === "km" ? "/ 1000" : ""}`;
  } else if (options.method === "spheroid") {
    expression = `ST_Distance_Spheroid(${quoteIdentifier(column1)}::GEOMETRY, ${
      quoteIdentifier(column2)
    }::GEOMETRY) ${options.unit === "km" ? "/ 1000" : ""}`;
  } else {
    throw new Error(
      `distance() received an unknown method: ${options.method}. Choose "srs", "haversine", or "spheroid".`,
    );
  }

  return typeof options.decimals === "number"
    ? `ROUND(${expression}, ${options.decimals})`
    : expression;
}
