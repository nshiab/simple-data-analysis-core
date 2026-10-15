import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import rewind, { isGeometry, type GeoGeometry } from "../helpers/rewind.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
export default async function getGeoData(
  SimpleTable: SimpleTable,
  column: string,
  options: { rewind?: boolean } = {},
) {
  const quotedColumn = quoteIdentifier(column);
  const query = `SELECT * EXCLUDE ${quotedColumn}, ST_AsGeoJSON(${quotedColumn}) AS ${quoteIdentifier(
    "geoJsonFragment",
  )} FROM ${quoteIdentifier(SimpleTable.name)};`;

  const queryResult = await queryDB(
    SimpleTable,
    query,
    mergeOptions(SimpleTable, {
      table: null,
      method: "getGeoData()",
      parameters: { column },
      returnData: true,
    }),
  );

  if (!queryResult) {
    throw new Error("The query did not return a result.");
  }

  const features = queryResult.map((d) => {
    const { geoJsonFragment, ...properties } = d;
    if (typeof geoJsonFragment !== "string" && geoJsonFragment !== null) {
      throw new Error("Expected a GeoJSON geometry string from DuckDB.");
    }
    const geometry: unknown = geoJsonFragment === null ? null : JSON.parse(geoJsonFragment);
    if (geometry !== null && !isGeometry(geometry)) {
      throw new Error("DuckDB returned an invalid GeoJSON geometry.");
    }

    const feature: {
      type: "Feature";
      geometry: GeoGeometry | null;
      properties: Record<string, unknown>;
    } = {
      type: "Feature",
      geometry,
      properties,
    };

    return feature;
  });

  const geoJSON: { type: "FeatureCollection"; features: typeof features } = {
    type: "FeatureCollection",
    features,
  };

  return options.rewind ? rewind(geoJSON) : geoJSON;
}
