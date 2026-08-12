import quoteIdentifier from "./quoteIdentifier.ts";
import { readFileSync, writeFileSync } from "node:fs";
import createDirectory from "./createDirectory.ts";
import getExtension from "./getExtension.ts";
import hasGeometryColumn from "./hasGeometryColumn.ts";
import queryDB from "./queryDB.ts";

import mergeOptions from "./mergeOptions.ts";
import rewind from "./rewind.ts";
import flushAllTables from "./flushAllTables.ts";
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
  const fileExtension = getExtension(file);
  assertWriteGeoDataOptions(fileExtension, options);

  if (!(await hasGeometryColumn(table))) {
    throw new Error(
      "Table contains no geometry columns. Use writeData() instead.",
    );
  }
  createDirectory(file);
  if (fileExtension === "geojson" || fileExtension === "json") {
    let types;
    let datesConverted = false;
    if (options.formatDates === true) {
      types = await table.getTypes();
      if (
        Object.values(types).includes("DATE") ||
        Object.values(types).includes("TIMESTAMP")
      ) {
        await stringifyDates(table, types);
        datesConverted = true;
      }
    }

    try {
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
    } finally {
      if (datesConverted && types) {
        await stringifyDatesInvert(table, types);
        // stringifyDatesInvert queues sync builder operations restoring the
        // date columns. writeGeoData is an observer, so it must leave no
        // queued work behind.
        await flushAllTables(table.sdb);
      }
    }
  } else if (fileExtension === "shp") {
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
    await queryDB(
      table,
      `COPY ${quoteIdentifier(table.name)} TO '${
        cleanPath(file)
      }' WITH (FORMAT PARQUET${
        options.compression === true ? ", COMPRESSION 'zstd'" : ""
      });`,
      mergeOptions(table, {
        table: table.name,
        method: "writeGeoData()",
        parameters: { file, options },
      }),
    );
  }
}

function assertWriteGeoDataOptions(
  fileExtension: string,
  options: {
    precision?: number;
    compression?: boolean;
    rewind?: boolean;
    metadata?: unknown;
    formatDates?: boolean;
  },
): void {
  if (!["geojson", "json", "shp", "geoparquet"].includes(fileExtension)) {
    throw new Error(
      `writeGeoData() does not support the extension ${
        JSON.stringify(fileExtension)
      }. Use .geojson, .json, .shp, or .geoparquet.`,
    );
  }
  if (
    (fileExtension === "geojson" || fileExtension === "json") &&
    typeof options.compression === "boolean"
  ) {
    throw new Error(
      "writeGeoData() compression is not supported for GeoJSON files.",
    );
  }
  if (
    fileExtension === "shp" &&
    (typeof options.precision === "number" ||
      typeof options.compression === "boolean" ||
      typeof options.rewind === "boolean" ||
      options.metadata !== undefined ||
      options.formatDates === true)
  ) {
    throw new Error(
      "writeGeoData() precision, compression, rewind, metadata, and formatDates are not supported for Shapefiles.",
    );
  }
  if (fileExtension === "geoparquet" && typeof options.precision === "number") {
    throw new Error(
      "writeGeoData() precision is not supported for GeoParquet files. Use reducePrecision() first.",
    );
  }
  if (fileExtension === "geoparquet" && typeof options.rewind === "boolean") {
    throw new Error(
      "writeGeoData() rewind is not supported for GeoParquet files.",
    );
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

    return `INSTALL spatial; LOAD spatial; SET geometry_always_xy = true; COPY ${
      quoteIdentifier(table)
    } to '${cleanPath(file)}' WITH (FORMAT GDAL, DRIVER 'GeoJSON'${
      layerOptions.length > 0
        ? `, LAYER_CREATION_OPTIONS ('WRITE_NAME=NO', ${
          layerOptions.map((d) => `'${d}'`).join(", ")
        })`
        : ""
    })`;
  } else if (fileExtension === "shp") {
    return `INSTALL spatial; LOAD spatial; SET geometry_always_xy = true; COPY ${
      quoteIdentifier(table)
    } TO '${
      cleanPath(file)
    }' WITH (FORMAT GDAL, DRIVER 'ESRI Shapefile', LAYER_CREATION_OPTIONS 'ENCODING=UTF-8')`;
  } else {
    throw new Error(`Unknown extension ${fileExtension}`);
  }
}
