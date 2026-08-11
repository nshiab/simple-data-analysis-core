import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import getExtension from "../helpers/getExtension.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import parseValue from "../helpers/parseValue.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import removeColumnsNow from "../helpers/removeColumnsNow.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function loadGeoData(
  simpleTable: SimpleTable,
  file: string,
  options: { toEPSG4326?: boolean } = {},
) {
  options = structuredClone(options);
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
  options: { toEPSG4326?: boolean },
): Promise<void> {
  const fileExtension = getExtension(file);

  if (fileExtension === "geoparquet" || fileExtension === "parquet") {
    await queryDB(
      simpleTable,
      `INSTALL spatial; LOAD spatial; SET geometry_always_xy = true;${
        file.toLowerCase().includes("http") ? " INSTALL https; LOAD https;" : ""
      }
      CREATE OR REPLACE TABLE ${
        quoteIdentifier(simpleTable.name)
      } AS SELECT * FROM read_parquet(${parseValue(file)});`,
      mergeOptions(simpleTable, {
        table: simpleTable.name,
        method: "loadGeoData()",
        parameters: { file, options },
      }),
    );
  } else {
    await queryDB(
      simpleTable,
      `INSTALL spatial; LOAD spatial; SET geometry_always_xy = true;${
        file.toLowerCase().includes("http") ? " INSTALL https; LOAD https;" : ""
      }
      CREATE OR REPLACE TABLE ${
        quoteIdentifier(simpleTable.name)
      } AS SELECT * FROM ST_Read(${parseValue(file)});`,
      mergeOptions(simpleTable, {
        table: simpleTable.name,
        method: "loadGeoData()",
        parameters: { file, options },
      }),
    );
  }
  simpleTable.sdb.spatialLoaded = true;

  if (await simpleTable.hasColumn("OGC_FID")) {
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
