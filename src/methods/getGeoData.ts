import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import rewind from "../helpers/rewind.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
// deno-lint-ignore no-explicit-any
type GeoPermissibleObjects = any;

export default async function getGeoData(
  SimpleTable: SimpleTable,
  column: string,
  options: { rewind?: boolean } = {},
) {
  const quotedColumn = quoteIdentifier(column);
  const query =
    `SELECT * EXCLUDE ${quotedColumn}, ST_AsGeoJSON(${quotedColumn}) AS ${
      quoteIdentifier("geoJsonFragment")
    } FROM ${quoteIdentifier(SimpleTable.name)};`;

  const queryResult = await queryDB(
    SimpleTable,
    query,
    mergeOptions(SimpleTable, {
      table: null,
      method: "getGeoData()",
      parameters: { column },
      returnData: true,
      dataTransport: SimpleTable.sdb.dataTransport,
    }),
  );

  if (!queryResult) {
    throw new Error("No queryResults");
  }

  const features = queryResult.map((d) => {
    const { geoJsonFragment, ...properties } = d;
    const geometry = JSON.parse(geoJsonFragment as string) as {
      "type": string;
      "coordinates": unknown[];
    };

    const feature = {
      type: "Feature",
      geometry,
      properties,
    };

    return feature;
  });

  const geoJSON = {
    type: "FeatureCollection",
    features,
  };

  return options.rewind
    ? rewind(geoJSON as GeoPermissibleObjects) as {
      type: string;
      features: {
        type: string;
        geometry: {
          type: string;
          coordinates: unknown[];
        };
        properties: {
          [key: string]: unknown;
        };
      }[];
    }
    : geoJSON;
}
