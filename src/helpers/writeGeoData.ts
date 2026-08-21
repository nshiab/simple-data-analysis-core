import quoteIdentifier from "./quoteIdentifier.ts";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
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
import writeZip from "./writeZip.ts";

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
  const compressedShapefileExtension = file.toLowerCase().endsWith(".shp.zip");
  const fileExtension = compressedShapefileExtension
    ? "shp"
    : getExtension(file);
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
    if (compressedShapefileExtension) {
      const shapefile = file.slice(0, -".zip".length);
      await writeCompressedShapefile(
        table,
        shapefile,
        file,
        file,
        options,
      );
    } else {
      await writeShapefile(table, file, file, options);
    }
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
      }. Use .geojson, .json, .shp, .shp.zip, or .geoparquet.`,
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
  if (fileExtension === "shp" && typeof options.compression === "boolean") {
    throw new Error(
      "writeGeoData() compression is not supported for Shapefiles. Use a .shp.zip file extension instead.",
    );
  }
  if (
    fileExtension === "shp" &&
    (typeof options.precision === "number" ||
      typeof options.rewind === "boolean" ||
      options.metadata !== undefined ||
      options.formatDates === true)
  ) {
    throw new Error(
      "writeGeoData() precision, rewind, metadata, and formatDates are not supported for Shapefiles.",
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

async function writeCompressedShapefile(
  table: SimpleTable,
  shapefile: string,
  archive: string,
  requestedFile: string,
  options: { compression?: boolean },
): Promise<void> {
  const temporaryDirectory = mkdtempSync(
    join(dirname(archive), `.${basename(shapefile)}-`),
  );
  const temporaryShapefile = join(temporaryDirectory, basename(shapefile));
  const temporaryArchive = `${temporaryShapefile}.zip`;
  let outcome:
    | { success: true }
    | { success: false; error: unknown };

  try {
    await writeShapefile(table, temporaryShapefile, requestedFile, options);
    const inputs = readdirSync(temporaryDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .sort((first, second) => first.name.localeCompare(second.name))
      .map((entry) => ({
        file: join(temporaryDirectory, entry.name),
        name: entry.name,
      }));
    await writeZip(temporaryArchive, inputs);
    renameSync(temporaryArchive, archive);
    outcome = { success: true };
  } catch (error) {
    outcome = { success: false, error };
  }

  try {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  } catch (cleanupError) {
    if (!outcome.success) {
      throw new AggregateError(
        [outcome.error, cleanupError],
        "Writing and cleaning up the compressed Shapefile both failed.",
        { cause: outcome.error },
      );
    }
    throw cleanupError;
  }

  if (!outcome.success) {
    throw outcome.error;
  }
}

async function writeShapefile(
  table: SimpleTable,
  outputFile: string,
  requestedFile: string,
  options: { compression?: boolean },
): Promise<void> {
  await queryDB(
    table,
    writeGeoDataQuery(table.name, outputFile, "shp"),
    mergeOptions(table, {
      table: table.name,
      method: "writeGeoData()",
      parameters: { file: requestedFile, options },
    }),
  );
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
    // DuckDB only finalizes the main file when a GDAL driver creates a
    // multi-file dataset, leaving Shapefile sidecars under the tmp_ prefix.
    // Remove USE_TMP_FILE false once the upstream fix is released:
    // https://github.com/duckdb/duckdb-spatial/issues/859
    return `INSTALL spatial; LOAD spatial; SET geometry_always_xy = true; COPY ${
      quoteIdentifier(table)
    } TO '${
      cleanPath(file)
    }' WITH (FORMAT GDAL, DRIVER 'ESRI Shapefile', LAYER_CREATION_OPTIONS 'ENCODING=UTF-8', USE_TMP_FILE false)`;
  } else {
    throw new Error(`Unknown extension ${fileExtension}`);
  }
}
