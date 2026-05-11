import { readFileSync, writeFileSync } from "node:fs";
import createDirectory from "./createDirectory.ts";
import getExtension from "./getExtension.ts";
import findGeoColumn from "./findGeoColumn.ts";
import shouldFlipBeforeExport from "./shouldFlipBeforeExport.ts";
import queryDB from "./queryDB.ts";
import writeGeoDataQuery from "../methods/writeGeoDataQuery.ts";
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
    const geoColumn = await findGeoColumn(table);
    const flip = shouldFlipBeforeExport(table.projections[geoColumn]);
    if (flip) {
      await table.flipCoordinates(geoColumn);
      await queryDB(
        table,
        writeGeoDataQuery(table.name, file, fileExtension, options),
        mergeOptions(table, {
          table: table.name,
          method: "writeGeoData()",
          parameters: { file, options },
        }),
      );

      await table.flipCoordinates(geoColumn);
    } else {
      await queryDB(
        table,
        writeGeoDataQuery(table.name, file, fileExtension, options),
        mergeOptions(table, {
          table: table.name,
          method: "writeGeoData()",
          parameters: { file, options },
        }),
      );
    }
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

    const geoColumn = await findGeoColumn(table);
    const flip = shouldFlipBeforeExport(table.projections[geoColumn]);

    if (flip) {
      await table.flipCoordinates(geoColumn);
      await queryDB(
        table,
        writeGeoDataQuery(table.name, file, fileExtension, options),
        mergeOptions(table, {
          table: table.name,
          method: "writeGeoData()",
          parameters: { file, options },
        }),
      );
      await table.flipCoordinates(geoColumn);
    } else {
      await queryDB(
        table,
        writeGeoDataQuery(table.name, file, fileExtension, options),
        mergeOptions(table, {
          table: table.name,
          method: "writeGeoData()",
          parameters: { file, options },
        }),
      );
    }
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
      }, KV_METADATA {
             projections: '${JSON.stringify(table.projections)}'
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
