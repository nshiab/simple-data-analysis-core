import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import getExtension from "../helpers/getExtension.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import parseValue from "../helpers/parseValue.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import removeColumnsNow from "../helpers/removeColumnsNow.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import { rmSync } from "node:fs";
import SDAError from "../class/SDAError.ts";
import loadOsmFile from "../helpers/loadOsmFile.ts";
import { recordCacheTableReferences } from "../helpers/cacheTableDependencies.ts";
import {
  downloadOsmToTemporaryFile,
  getOsmFileSuffix,
  isRemoteOsmUrl,
} from "../helpers/osmFiles.ts";

type LoadGeoDataOptions = {
  toEPSG4326?: boolean;
  columns?: string[];
  conditions?: string;
};

export default function loadGeoData(
  simpleTable: SimpleTable,
  file: string,
  options: LoadGeoDataOptions = {},
) {
  options = structuredClone(options);
  if (options.conditions !== undefined) {
    recordCacheTableReferences(simpleTable, [options.conditions]);
  }
  queueOp(simpleTable, {
    kind: "barrier",
    method: "loadGeoData()",
    parameters: { file, options },
    execute: () => executeLoadGeoData(simpleTable, file, options),
  });
}

async function executeLoadGeoData(
  simpleTable: SimpleTable,
  file: string,
  options: LoadGeoDataOptions,
): Promise<void> {
  const osmSuffix = getOsmFileSuffix(file);
  if (osmSuffix !== null) {
    let temporaryFile: string | undefined;
    try {
      const localFile = isRemoteOsmUrl(file)
        ? temporaryFile = await downloadOsmToTemporaryFile(file, {
          suffix: osmSuffix,
          request: { headers: { "accept-encoding": "gzip" } },
        })
        : file;
      await loadOsmFile(simpleTable, localFile, {
        method: "loadGeoData()",
        parameters: { file, options },
        columns: options.columns,
        conditions: options.conditions,
      });
      return;
    } catch (error) {
      if (error instanceof SDAError) {
        throw error;
      }
      throw new SDAError({
        method: "loadGeoData()",
        parameters: { file, options },
        query: "",
        cause: error,
      });
    } finally {
      if (temporaryFile !== undefined) {
        rmSync(temporaryFile, { force: true });
      }
    }
  }

  const fileExtension = getExtension(file);
  const selectColumns = options.columns !== undefined &&
      options.columns.length > 0
    ? options.columns.map(quoteIdentifier).join(", ")
    : "*";
  const spatialSetup = simpleTable.sdb.spatialLoaded
    ? ""
    : "INSTALL spatial; LOAD spatial; SET geometry_always_xy = true;";
  const conditions = options.conditions ? ` WHERE ${options.conditions}` : "";

  if (fileExtension === "geoparquet" || fileExtension === "parquet") {
    await queryDB(
      simpleTable,
      `${spatialSetup}${
        file.toLowerCase().includes("http") ? " INSTALL https; LOAD https;" : ""
      }
      CREATE OR REPLACE TABLE ${
        quoteIdentifier(simpleTable.name)
      } AS SELECT ${selectColumns} FROM read_parquet(${
        parseValue(file)
      })${conditions};`,
      mergeOptions(simpleTable, {
        table: simpleTable.name,
        method: "loadGeoData()",
        parameters: { file, options },
      }),
    );
  } else {
    await queryDB(
      simpleTable,
      `${spatialSetup}${
        file.toLowerCase().includes("http") ? " INSTALL https; LOAD https;" : ""
      }
      CREATE OR REPLACE TABLE ${
        quoteIdentifier(simpleTable.name)
      } AS SELECT ${selectColumns} FROM ST_Read(${
        parseValue(file)
      })${conditions};`,
      mergeOptions(simpleTable, {
        table: simpleTable.name,
        method: "loadGeoData()",
        parameters: { file, options },
      }),
    );
  }
  simpleTable.sdb.spatialLoaded = true;

  const mayIncludeOgcFid = options.columns === undefined ||
    options.columns.length === 0 || options.columns.includes("OGC_FID");
  if (mayIncludeOgcFid && await simpleTable.hasColumn("OGC_FID")) {
    await removeColumnsNow(simpleTable, ["OGC_FID"], "loadGeoData()");
  }

  if (options.toEPSG4326) {
    const geoType = await simpleTable.getProjection("geom");
    if (geoType !== "GEOMETRY('EPSG:4326')") {
      // The reprojection runs directly (not with the sync reproject builder,
      // which would queue for the next flush).
      await queryDB(
        simpleTable,
        `CREATE OR REPLACE TABLE ${
          quoteIdentifier(simpleTable.name)
        } AS SELECT * REPLACE (ST_Transform("geom", 'EPSG:4326')::GEOMETRY('EPSG:4326') AS "geom") FROM ${
          quoteIdentifier(simpleTable.name)
        }`,
        mergeOptions(simpleTable, {
          table: simpleTable.name,
          method: "loadGeoData()",
          parameters: { file, options },
        }),
      );
    }
  }
}
