import { readFileSync, writeFileSync } from "node:fs";
import createDirectory from "./createDirectory.ts";
import getExtension from "./getExtension.ts";
import hasGeometryColumn from "./hasGeometryColumn.ts";
import queryDB from "./queryDB.ts";

import mergeOptions from "./mergeOptions.ts";
import rewind from "./rewind.ts";
import stringifyDates from "./stringifyDates.ts";
import stringifyDatesInvert from "./stringifyDatesInvert.ts";
import cleanPath from "./cleanPath.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function writeGeoData(
  table: SimpleTable,
  file: string,
  options: {
    precision?: number;
    compression?: boolean;
    rewind?: boolean;
    metadata?: unknown;
    formatDates?: boolean;
  } = {},
): Promise<void> {
  createDirectory(file);
  if (!(await hasGeometryColumn(table))) {
    throw new Error(
      "Table contains no geometry columns. Use writeData() instead.",
    );
  }
  const fileExtension = getExtension(file);
  if (fileExtension === "geojson" || fileExtension === "json") {
    let types;
    if (options.formatDates === true) {
      types = await table.getTypes();
      if (
        Object.values(types).includes("DATE") ||
        Object.values(types).includes("TIMESTAMP")
      ) {
        await stringifyDates(table, types);
      }
    }

    if (typeof options.compression === "boolean") {
      throw new Error(
        "The compression option is not supported for writing GeoJSON files.",
      );
    }

    await queryDB(
      table,
      writeGeoDataQuery(table.name, file, fileExtension, options),
      mergeOptions(table, {
        table: table.name,
        method: "writeGeoData()",
        parameters: { file, options },
      }),
    );

    if (options.metadata) {
      const fileData = JSON.parse(readFileSync(file, "utf-8"));
      fileData.metadata = options.metadata;
      writeFileSync(file, JSON.stringify(fileData));
    }
    if (options.rewind) {
      const fileData = JSON.parse(readFileSync(file, "utf-8"));
      const fileRewinded = rewind(fileData);
      writeFileSync(file, JSON.stringify(fileRewinded));
    }
    if (
      types && (Object.values(types).includes("DATE") ||
        Object.values(types).includes("TIMESTAMP"))
    ) {
      await stringifyDatesInvert(table, types);
    }
  } else if (fileExtension === "shp") {
    if (
      typeof options.precision === "number" ||
      typeof options.compression === "boolean" ||
      typeof options.rewind === "boolean" ||
      options.metadata ||
      options.formatDates === true
    ) {
      throw new Error(
        "The following options are not supported for writing SHAPEFILE files: precision, compression, rewind, metadata, and formatDates.",
      );
    }

    await queryDB(
      table,
      writeGeoDataQuery(table.name, file, fileExtension, options),
      mergeOptions(table, {
        table: table.name,
        method: "writeGeoData()",
        parameters: { file, options },
      }),
    );
  } else if (fileExtension === "geoparquet") {
    if (typeof options.precision === "number") {
      throw new Error(
        "The precision option is not supported for writing PARQUET files. Use the .reducePrecision() method.",
      );
    }
    if (typeof options.rewind === "boolean") {
      throw new Error(
        "The rewind option is not supported for writing PARQUET files.",
      );
    }
    await queryDB(
      table,
      `COPY "${table.name}" TO '${cleanPath(file)}' WITH (FORMAT PARQUET${
        options.compression === true ? ", COMPRESSION 'zstd'" : ""
      });`,
      mergeOptions(table, {
        table: table.name,
        method: "writeGeoData()",
        parameters: { file, options },
      }),
    );
  } else {
    throw new Error(`Unknown extension ${fileExtension}`);
  }
}

function writeGeoDataQuery(
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

    return `INSTALL spatial; LOAD spatial; SET geometry_always_xy = true; COPY "${table}" to '${
      cleanPath(file)
    }' WITH (FORMAT GDAL, DRIVER 'GeoJSON'${
      layerOptions.length > 0
        ? `, LAYER_CREATION_OPTIONS ('WRITE_NAME=NO', ${
          layerOptions.map((d) => `'${d}'`).join(", ")
        })`
        : ""
    })`;
  } else if (fileExtension === "shp") {
    return `INSTALL spatial; LOAD spatial; SET geometry_always_xy = true; COPY "${table}" TO '${
      cleanPath(file)
    }' WITH (FORMAT GDAL, DRIVER 'ESRI Shapefile', LAYER_CREATION_OPTIONS 'ENCODING=UTF-8')`;
  } else {
    throw new Error(`Unknown extension ${fileExtension}`);
  }
}
