import cleanPath from "../helpers/cleanPath.ts";

export default function writeGeoDataQuery(
  table: string,
  file: string,
  fileExtension: string,
  options: { precision?: number } = {},
) {
  if (fileExtension === "geojson" || fileExtension === "json") {
    const layerOptions = [];
    if (typeof options.precision === "number") {
      layerOptions.push(`COORDINATE_PRECISION=${options.precision}`);
    }
    layerOptions.push(`RFC7946=YES`);

    return `INSTALL spatial; LOAD spatial; COPY "${table}" to '${
      cleanPath(file)
    }' WITH (FORMAT GDAL, DRIVER 'GeoJSON'${
      layerOptions.length > 0
        ? `, LAYER_CREATION_OPTIONS ('WRITE_NAME=NO', ${
          layerOptions.map((d) => `'${d}'`).join(", ")
        })`
        : ""
    })`;
  } else if (fileExtension === "shp") {
    return `INSTALL spatial; LOAD spatial; COPY "${table}" TO '${
      cleanPath(file)
    }' WITH (FORMAT GDAL, DRIVER 'ESRI Shapefile', LAYER_CREATION_OPTIONS 'ENCODING=UTF-8')`;
  } else {
    throw new Error(`Unknown extension ${fileExtension}`);
  }
}
