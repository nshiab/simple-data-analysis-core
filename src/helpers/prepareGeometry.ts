/** Validates and snapshots a two-dimensional WGS84 GeoJSON geometry cell. */
export default function prepareGeometry(
  value: unknown,
  column: string,
  row: number,
): string | null {
  if (value === null) return null;
  const fail = (message: string): never => {
    throw new Error(`Column ${JSON.stringify(column)}, row ${row}: ${message}`);
  };
  const active = new Set<object>();
  let hasSignedZero = false;
  function position(value: unknown): number[] {
    if (
      !Array.isArray(value) || value.length !== 2 ||
      !Array.from(value).every((n) =>
        typeof n === "number" && Number.isFinite(n)
      )
    ) {
      fail(
        "Expected a finite two-dimensional [longitude, latitude] position; Z/M coordinates are unsupported.",
      );
    }
    const point = value as number[];
    if (Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) {
      fail(
        "Expected WGS84 longitude [-180, 180] and latitude [-90, 90]; reproject the input first.",
      );
    }
    hasSignedZero ||= Object.is(point[0], -0) || Object.is(point[1], -0);
    return [...point];
  }
  function list(value: unknown, convert: (v: unknown) => unknown): unknown[] {
    if (!Array.isArray(value)) fail("Expected a coordinate array.");
    return Array.from(value as unknown[], convert);
  }
  function line(value: unknown): unknown[] {
    const points = list(value, position);
    if (points.length < 2) {
      fail("A LineString must contain at least two positions.");
    }
    return points;
  }
  function ring(value: unknown): unknown[] {
    const points = list(value, position) as number[][];
    if (
      points.length < 4 || points[0][0] !== points.at(-1)![0] ||
      points[0][1] !== points.at(-1)![1]
    ) {
      fail(
        "A polygon ring must contain at least four positions and be closed.",
      );
    }
    return points;
  }
  function geometry(value: unknown): object {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      fail("Expected a GeoJSON geometry object or null.");
    }
    const object = value as Record<string, unknown>;
    if (active.has(object)) fail("Cyclic GeometryCollections are unsupported.");
    if (active.size >= 100) {
      fail("GeometryCollections may nest at most 100 levels.");
    }
    active.add(object);
    try {
      const type = object.type;
      if (type === "Feature" || type === "FeatureCollection") {
        fail(
          "Expected a GeoJSON geometry object, not a Feature or FeatureCollection; extract each feature's geometry first.",
        );
      }
      if ("crs" in object) {
        fail(
          "Geometry crs members are unsupported; supply WGS84 coordinates and declare GEOMETRY('EPSG:4326').",
        );
      }
      let coordinates: unknown;
      switch (type) {
        case "Point":
          coordinates = position(object.coordinates);
          break;
        case "MultiPoint":
          coordinates = list(object.coordinates, position);
          break;
        case "LineString":
          coordinates = line(object.coordinates);
          break;
        case "MultiLineString":
          coordinates = list(object.coordinates, line);
          break;
        case "Polygon":
          coordinates = list(object.coordinates, ring);
          break;
        case "MultiPolygon":
          coordinates = list(object.coordinates, (v) => list(v, ring));
          break;
        case "GeometryCollection":
          return { type, geometries: list(object.geometries, geometry) };
        default:
          fail("Expected a supported GeoJSON geometry type.");
      }
      return { type, coordinates };
    } finally {
      active.delete(object);
    }
  }
  const prepared = geometry(value);
  if (!hasSignedZero) return JSON.stringify(prepared);
  // JSON.stringify normalizes -0. Only supported geometry type names survive
  // validation as strings, so the "-0" marker cannot collide with input text.
  // Emit a decimal literal so DuckDB also preserves its sign when parsing JSON.
  return JSON.stringify(
    prepared,
    (_key, cell: unknown) => Object.is(cell, -0) ? "-0" : cell,
  ).replaceAll('"-0"', "-0.0");
}
