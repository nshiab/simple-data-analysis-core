import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import type SimpleTable from "../class/SimpleTable.ts";

// This is the mean Earth radius used by DuckDB's ST_Distance_Sphere().
const EARTH_RADIUS_METERS = 6_371_000;

export default function addGeoNoise(
  simpleTable: SimpleTable,
  maxDistance: number,
  options: {
    column?: string;
    unit?: "m" | "km";
    onlyDuplicates?: boolean;
  } = {},
) {
  // This validation doesn't need the database, so it stays at call time.
  if (!Number.isFinite(maxDistance) || maxDistance < 0) {
    throw new Error(
      "addGeoNoise() maxDistance must be a finite number greater than or equal to 0.",
    );
  }
  if (
    options.unit !== undefined && options.unit !== "m" && options.unit !== "km"
  ) {
    throw new Error('addGeoNoise() options.unit must be "m" or "km".');
  }

  options = structuredClone(options);
  const maxDistanceMeters = options.unit === "km"
    ? maxDistance * 1_000
    : maxDistance;
  if (maxDistanceMeters > Math.PI * EARTH_RADIUS_METERS) {
    throw new Error(
      "addGeoNoise() maxDistance cannot exceed half the Earth's circumference.",
    );
  }

  queueOp(simpleTable, {
    kind: "fusable",
    method: "addGeoNoise()",
    parameters: { maxDistance, options },
    needsSchema: true,
    needsSpatial: true,
    preservesSchema: true,
    buildSelect: (input, schema) => {
      const column = options.column ??
        findGeoColumnFromSchema(schema, "addGeoNoise()", simpleTable.name);
      return addGeoNoiseSelect(
        input,
        schema,
        column,
        maxDistanceMeters,
        options.onlyDuplicates === true,
      );
    },
  });
}

function addGeoNoiseSelect(
  input: string,
  schema: TableSchema,
  column: string,
  maxDistanceMeters: number,
  onlyDuplicates: boolean,
): string {
  const type = schema[column];
  if (type === undefined) {
    throw new Error(
      `addGeoNoise() could not find column ${quoteIdentifier(column)}.`,
    );
  }
  if (type !== "GEOMETRY('EPSG:4326')") {
    throw new Error(
      `addGeoNoise() requires an EPSG:4326 geometry column, but ${
        quoteIdentifier(column)
      } has type ${type}. Reproject it to EPSG:4326 first.`,
    );
  }

  const internalNames = makeInternalNames(schema, input);
  const quotedColumn = quoteIdentifier(column);
  const pointError =
    `error('addGeoNoise() requires POINT geometries in column ${
      column.replaceAll("'", "''")
    }.')`;
  const coordinateGuard = (coordinate: "X" | "Y") =>
    `CASE
    WHEN ${quotedColumn} IS NULL OR ST_IsEmpty(${quotedColumn}) THEN NULL
    WHEN CAST(ST_GeometryType(${quotedColumn}) AS VARCHAR) <> 'POINT'
      THEN ${pointError}
    ELSE radians(ST_${coordinate}(${quotedColumn}))
  END`;
  const duplicateCount = onlyDuplicates
    ? `COUNT(*) OVER (PARTITION BY ${quotedColumn})`
    : "2";
  const maxAngularDistance = maxDistanceMeters / EARTH_RADIUS_METERS;

  const latitudeExpression = `asin(
    sin(${quoteIdentifier(internalNames.latitude)}) * cos(${
    quoteIdentifier(internalNames.angularDistance)
  }) +
    cos(${quoteIdentifier(internalNames.latitude)}) * sin(${
    quoteIdentifier(internalNames.angularDistance)
  }) * cos(${quoteIdentifier(internalNames.bearing)})
  )`;
  const longitudeExpression = `${
    quoteIdentifier(internalNames.longitude)
  } + atan2(
    sin(${quoteIdentifier(internalNames.bearing)}) * sin(${
    quoteIdentifier(internalNames.angularDistance)
  }) * cos(${quoteIdentifier(internalNames.latitude)}),
    cos(${quoteIdentifier(internalNames.angularDistance)}) -
      sin(${quoteIdentifier(internalNames.latitude)}) * sin(${
    quoteIdentifier(internalNames.destinationLatitude)
  })
  )`;
  const replacement = `CASE
    WHEN ${quotedColumn} IS NULL OR ST_IsEmpty(${quotedColumn}) THEN ${quotedColumn}
    WHEN ${
    quoteIdentifier(internalNames.duplicateCount)
  } <= 1 THEN ${quotedColumn}
    ELSE ST_Point(
      degrees(atan2(
        sin(${quoteIdentifier(internalNames.destinationLongitude)}),
        cos(${quoteIdentifier(internalNames.destinationLongitude)})
      )),
      degrees(${quoteIdentifier(internalNames.destinationLatitude)})
    )::GEOMETRY('EPSG:4326')
  END AS ${quotedColumn}`;
  const outputColumns = Object.keys(schema).map((outputColumn) =>
    outputColumn === column ? replacement : quoteIdentifier(outputColumn)
  ).join(", ");

  return `WITH ${quoteIdentifier(internalNames.randomValues)} AS MATERIALIZED (
    SELECT *,
      random() AS ${quoteIdentifier(internalNames.distanceRandom)},
      random() AS ${quoteIdentifier(internalNames.bearingRandom)},
      ${duplicateCount} AS ${quoteIdentifier(internalNames.duplicateCount)}
    FROM ${input}
  ),
  ${quoteIdentifier(internalNames.start)} AS (
    SELECT *,
      ${coordinateGuard("Y")} AS ${quoteIdentifier(internalNames.latitude)},
      ${coordinateGuard("X")} AS ${quoteIdentifier(internalNames.longitude)},
      2 * pi() * ${quoteIdentifier(internalNames.bearingRandom)} AS ${
    quoteIdentifier(internalNames.bearing)
  },
      2 * asin(
        sqrt(${quoteIdentifier(internalNames.distanceRandom)}) *
        sin(${maxAngularDistance} / 2)
      ) AS ${quoteIdentifier(internalNames.angularDistance)}
    FROM ${quoteIdentifier(internalNames.randomValues)}
  ),
  ${quoteIdentifier(internalNames.destinationLatitudeCte)} AS (
    SELECT *, ${latitudeExpression} AS ${
    quoteIdentifier(internalNames.destinationLatitude)
  }
    FROM ${quoteIdentifier(internalNames.start)}
  ),
  ${quoteIdentifier(internalNames.destination)} AS (
    SELECT *, ${longitudeExpression} AS ${
    quoteIdentifier(internalNames.destinationLongitude)
  }
    FROM ${quoteIdentifier(internalNames.destinationLatitudeCte)}
  )
  SELECT ${outputColumns}
  FROM ${quoteIdentifier(internalNames.destination)}`;
}

function makeInternalNames(schema: TableSchema, input: string) {
  const used = new Set(Object.keys(schema));
  if (input.startsWith('"') && input.endsWith('"')) {
    used.add(input.slice(1, -1).replaceAll('""', '"'));
  }
  const next = (base: string) => {
    let name = base;
    let suffix = 2;
    while (used.has(name)) {
      name = `${base}_${suffix++}`;
    }
    used.add(name);
    return name;
  };

  return {
    randomValues: next("__sda_add_geo_noise_random_values"),
    start: next("__sda_add_geo_noise_start"),
    destinationLatitudeCte: next("__sda_add_geo_noise_latitude_result"),
    destination: next("__sda_add_geo_noise_result"),
    distanceRandom: next("__sda_add_geo_noise_distance_random"),
    bearingRandom: next("__sda_add_geo_noise_bearing_random"),
    duplicateCount: next("__sda_add_geo_noise_duplicate_count"),
    latitude: next("__sda_add_geo_noise_latitude"),
    longitude: next("__sda_add_geo_noise_longitude"),
    bearing: next("__sda_add_geo_noise_bearing"),
    angularDistance: next("__sda_add_geo_noise_angular_distance"),
    destinationLatitude: next("__sda_add_geo_noise_destination_latitude"),
    destinationLongitude: next("__sda_add_geo_noise_destination_longitude"),
  };
}
