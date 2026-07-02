import cleanPath from "../helpers/cleanPath.ts";
import getExtension from "../helpers/getExtension.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function loadGeoData(
  simpleTable: SimpleTable,
  file: string,
  options: { toWGS84?: boolean } = {},
) {
  const fileExtension = getExtension(file);

  if (fileExtension === "geoparquet" || fileExtension === "parquet") {
    await queryDB(
      simpleTable,
      `INSTALL spatial; LOAD spatial; SET geometry_always_xy = true;${
        file.toLowerCase().includes("http") ? " INSTALL https; LOAD https;" : ""
      }
              CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * FROM read_parquet('${
        cleanPath(file)
      }');`,
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
              CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * FROM ST_Read('${file}');`,
      mergeOptions(simpleTable, {
        table: simpleTable.name,
        method: "loadGeoData()",
        parameters: { file, options },
      }),
    );
  }

  if (await simpleTable.hasColumn("OGC_FID")) {
    await simpleTable.removeColumns("OGC_FID");
  }

  if (options.toWGS84) {
    const geoType = await simpleTable.getProjection("geom");
    if (geoType !== "GEOMETRY('EPSG:4326')") {
      await simpleTable.reproject("EPSG:4326");
    }
  }
}
