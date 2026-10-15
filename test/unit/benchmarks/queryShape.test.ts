import { test, expect } from "vite-plus/test";
import { ok as assert } from "node:assert/strict";
import { mkdtemp as nodeMkdtemp, writeFile as nodeWriteFile, rm as nodeRm } from "node:fs/promises";
import { join as nodeJoin } from "node:path";
import { tmpdir as nodeTmpdir } from "node:os";

import SimpleDB from "../../../src/class/SimpleDB.ts";
import { observeSdaQueries } from "../../../benchmarks/queryProfile.ts";
import runTabularSdaPipeline from "../../../benchmarks/tabular/sdaPipeline.ts";
import runSpatialSdaPipeline from "../../../benchmarks/spatial/sdaPipeline.ts";

test("tabular benchmark keeps its typed source in one fused load", async () => {
  const directory = await nodeMkdtemp(nodeJoin(nodeTmpdir(), "sda-test-"));
  const input = `${directory}/temperatures.csv`;
  await nodeWriteFile(
    input,
    `time,station,station_name,tas
2001-01-01,1,Alpha,2.5
2002-01-01,1,Alpha,3.5
2011-01-01,2,Beta,4.5
2012-01-01,2,Beta,
`,
  );
  const sdb = new SimpleDB();
  const observer = observeSdaQueries(sdb);
  try {
    await runTabularSdaPipeline(sdb, {
      input,
      cleanOutput: `${directory}/clean.csv`,
      resultOutput: `${directory}/result.csv`,
    });

    const sourceDescriptions = observer.queries.filter(
      (entry) => entry.query.startsWith("DESCRIBE WITH") && entry.query.includes("read_csv_auto"),
    );
    expect(sourceDescriptions.length).toStrictEqual(0);

    const materializations = observer.queries.filter((entry) =>
      entry.query.includes('CREATE OR REPLACE TABLE "temperatures"'),
    );
    expect(materializations.length).toStrictEqual(2);
    expect(materializations[0].query).toContain("read_csv_auto");
    expect(materializations[0].query).toContain('"s4"');
    expect(materializations[1].query).toContain("AVG(");
  } finally {
    observer.restore();
    await sdb.close();
    await nodeRm(directory, { recursive: true });
  }
});

test("spatial benchmark fuses its tree scan and loads spatial once", async () => {
  const directory = await nodeMkdtemp(nodeJoin(nodeTmpdir(), "sda-test-"));
  const treesInput = `${directory}/trees.csv`;
  const neighbourhoodsInput = `${directory}/neighbourhoods.geojson`;
  await nodeWriteFile(
    treesInput,
    `Latitude,Longitude
45.50,-73.60
45.51,-73.61
46.00,-74.00
`,
  );
  await nodeWriteFile(
    neighbourhoodsInput,
    JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { nom_qr: "Centre" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-73.7, 45.4],
                [-73.5, 45.4],
                [-73.5, 45.6],
                [-73.7, 45.6],
                [-73.7, 45.4],
              ],
            ],
          },
        },
      ],
    }),
  );
  const sdb = new SimpleDB();
  const observer = observeSdaQueries(sdb);
  try {
    await runSpatialSdaPipeline(sdb, {
      treesInput,
      neighbourhoodsInput,
      resultOutput: `${directory}/result.csv`,
    });

    const treeMaterializations = observer.queries.filter((entry) =>
      entry.query.includes('CREATE OR REPLACE TABLE "trees"'),
    );
    expect(treeMaterializations.length).toStrictEqual(1);
    expect(treeMaterializations[0].query).toContain("read_csv_auto");
    expect(treeMaterializations[0].query).toContain("ST_Point");

    const spatialLoads = observer.queries.filter((entry) =>
      entry.query.includes("INSTALL spatial"),
    );
    expect(spatialLoads.length).toStrictEqual(1);

    const joinedMaterializations = observer.queries.filter((entry) =>
      entry.query.includes('CREATE OR REPLACE TABLE "joined"'),
    );
    expect(joinedMaterializations.length).toStrictEqual(1);
    assert(joinedMaterializations[0].query.includes("ST_Covers"));
    assert(joinedMaterializations[0].query.includes("COUNT(*)"));
  } finally {
    observer.restore();
    await sdb.close();
    await nodeRm(directory, { recursive: true });
  }
});
