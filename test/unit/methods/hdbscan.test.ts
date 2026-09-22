import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

type Fixture = {
  packages: { hdbscan: string };
  referenceSettings: {
    algorithm: string;
    approx_min_span_tree: boolean;
    cluster_selection_method: string;
    allow_single_cluster: boolean;
  };
  cases: {
    name: string;
    metric: "euclidean" | "cosine";
    minClusterSize: number;
    minSamples: number;
    vectors: number[][];
    labels: number[];
    probabilities: number[];
    outlierScores: number[];
  }[];
};

// Precomputed hdbscan 0.8.44 reference inputs and expected outputs.
const fixture = JSON.parse(
  await Deno.readTextFile(
    new URL("../../data/hdbscan/reference.json", import.meta.url),
  ),
) as Fixture;

type DegenerateFixture = {
  packages: { hdbscan: string };
  settings: {
    min_cluster_size: number;
    min_samples: number;
    metric: "euclidean";
  };
  cases: DegenerateCase[];
  decimalBoundaryCases: DegenerateCase[];
  largeOffsetDistanceEvidence: {
    vectors: number[][];
    stableDifferenceDistance: number;
    sklearnPairwiseDistance: number;
  };
};

type DegenerateCase = {
  epsilon: number;
  vectors: number[][];
  allowSingleCluster: boolean;
  labels: number[];
  probabilities: number[];
  referenceGlosh: (number | "NaN")[];
  proposedFiniteGlosh?: number[];
};

// Python NaN scores are recorded as strings; SDA tests the finite-limit values.
const degenerateFixture = JSON.parse(
  await Deno.readTextFile(
    new URL("../../data/hdbscan/degenerate-reference.json", import.meta.url),
  ),
) as DegenerateFixture;

function clusterNumber(label: unknown): number {
  assert(typeof label === "string");
  if (label === "noise") return -1;
  assert(/^cluster-\d+$/.test(label));
  return Number(label.slice("cluster-".length));
}

function assertSamePartition(actual: number[], expected: number[]): void {
  assertEquals(
    actual.map((label) => label < 0),
    expected.map((label) => label < 0),
  );
  for (let left = 0; left < actual.length; left++) {
    for (let right = 0; right < actual.length; right++) {
      assertEquals(
        actual[left] >= 0 && actual[left] === actual[right],
        expected[left] >= 0 && expected[left] === expected[right],
      );
    }
  }
}

function assertClose(
  actual: number[],
  expected: number[],
  tolerance = 1e-10,
): void {
  assertEquals(actual.length, expected.length);
  actual.forEach((value, index) =>
    assertAlmostEquals(value, expected[index], tolerance)
  );
}

async function scratchRelations(sdb: SimpleDB): Promise<string[]> {
  return (await sdb.connection!.runAndReadAll(
    `SELECT table_name AS name FROM duckdb_tables()
     WHERE table_name LIKE '__sda_features_%'
        OR table_name LIKE '__sda_hdbscan_%'
     UNION ALL
     SELECT index_name AS name FROM duckdb_indexes()
     WHERE index_name LIKE '__sda_hdbscan_%'
     ORDER BY name`,
  )).getRowsJS().map((row) => String(row[0]));
}

for (const reference of fixture.cases) {
  Deno.test(`hdbscan exact public outputs match hdbscan 0.8.44 for ${reference.name}`, async () => {
    assertEquals(fixture.packages.hdbscan, "0.8.44");
    assertEquals(fixture.referenceSettings.algorithm, "generic");
    assertEquals(fixture.referenceSettings.approx_min_span_tree, false);
    assertEquals(fixture.referenceSettings.cluster_selection_method, "eom");
    assertEquals(fixture.referenceSettings.allow_single_cluster, true);
    const sdb = new SimpleDB();
    try {
      const dimensions = reference.vectors[0].length;
      await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
        ${
        reference.vectors.map((vector, index) =>
          `(${index},[${
            vector.join(",")
          }]::DOUBLE[${dimensions}],'row-${index}')`
        ).join(",")
      }) rows(id,features,label)`);
      const table = sdb.newTable("source");
      const before = await table.getData();
      const typesBefore = await table.getTypes();
      await table.hdbscan("features", "cluster", {
        minClusterSize: reference.minClusterSize,
        minSamples: reference.minSamples,
        metric: reference.metric,
        allowSingleCluster: fixture.referenceSettings.allow_single_cluster,
        membershipScoreColumn: "membership",
        outlierScoreColumn: "outlier",
      }).run();
      const data = await table.getData();
      assertSamePartition(
        data.map((row) => clusterNumber(row.cluster)),
        reference.labels,
      );
      assertClose(
        data.map((row) => Number(row.membership)),
        reference.probabilities,
      );
      assertClose(
        data.map((row) => Number(row.outlier)),
        reference.outlierScores,
      );
      assertEquals(
        data.map((row) => ({
          id: row.id,
          features: row.features,
          label: row.label,
        })),
        before,
      );
      assertEquals(await table.getTypes(), {
        ...typesBefore,
        cluster: "VARCHAR",
        membership: "DOUBLE",
        outlier: "DOUBLE",
      });
      assertEquals(await scratchRelations(sdb), []);
    } finally {
      await sdb.close();
    }
  });
}

for (const [caseIndex, reference] of degenerateFixture.cases.entries()) {
  Deno.test(`hdbscan preserves 0.8.44 GLOSH limits for degenerate case ${caseIndex} at epsilon ${reference.epsilon}`, async () => {
    assertEquals(degenerateFixture.packages.hdbscan, "0.8.44");
    const sdb = new SimpleDB();
    try {
      await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
        ${
        reference.vectors.map((vector, index) =>
          `(${index},[${vector[0]}]::DOUBLE[1])`
        ).join(",")
      }) rows(id,features)`);
      const table = sdb.newTable("source");
      await table.hdbscan("features", "cluster", {
        minClusterSize: degenerateFixture.settings.min_cluster_size,
        minSamples: degenerateFixture.settings.min_samples,
        metric: degenerateFixture.settings.metric,
        allowSingleCluster: reference.allowSingleCluster,
        membershipScoreColumn: "membership",
        outlierScoreColumn: "outlier",
      }).run();
      const data = await table.getData();
      assertEquals(
        data.map((row) => clusterNumber(row.cluster)),
        reference.labels,
      );
      assertClose(
        data.map((row) => Number(row.membership)),
        reference.probabilities,
      );
      const expectedGlosh = reference.proposedFiniteGlosh ??
        reference.referenceGlosh as number[];
      assertClose(
        data.map((row) => Number(row.outlier)),
        expectedGlosh,
        1e-10,
      );
      assert(data.every((row) => Number.isFinite(row.outlier)));
      assertEquals(await scratchRelations(sdb), []);
    } finally {
      await sdb.close();
    }
  });
}

Deno.test("hdbscan retains finite GLOSH evidence across decimal tie boundaries", async () => {
  for (const reference of degenerateFixture.decimalBoundaryCases) {
    const sdb = new SimpleDB();
    try {
      await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
        ${
        reference.vectors.map((vector, index) =>
          `(${index},[${vector[0]}]::DOUBLE[1])`
        ).join(",")
      }) rows(id,features)`);
      const table = sdb.newTable("source");
      await table.hdbscan("features", "cluster", {
        minClusterSize: degenerateFixture.settings.min_cluster_size,
        minSamples: degenerateFixture.settings.min_samples,
        allowSingleCluster: true,
        outlierScoreColumn: "outlier",
      }).run();
      assertClose(
        (await table.getData()).map((row) => Number(row.outlier)),
        reference.referenceGlosh as number[],
        1e-10,
      );
      assertEquals(await scratchRelations(sdb), []);
    } finally {
      await sdb.close();
    }
  }
});

Deno.test("hdbscan keeps native large-offset Euclidean separations", async () => {
  const sdb = new SimpleDB();
  try {
    const [left, right] = degenerateFixture.largeOffsetDistanceEvidence.vectors;
    await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
      (0,[${left.join(",")}]::DOUBLE[2]),
      (1,[${right.join(",")}]::DOUBLE[2]),
      (2,[${left[0]},${left[1] + 1}]::DOUBLE[2])
    ) rows(id,features)`);
    assertEquals(
      Number(
        (await sdb.connection!.runAndReadAll(
          "SELECT array_distance(a.features,b.features) FROM source a,source b WHERE a.id=0 AND b.id=1",
        )).getRowsJS()[0][0],
      ),
      degenerateFixture.largeOffsetDistanceEvidence.stableDifferenceDistance,
    );
    assertEquals(
      degenerateFixture.largeOffsetDistanceEvidence.sklearnPairwiseDistance,
      0,
    );
    const table = sdb.newTable("source");
    await table.hdbscan("features", "cluster", {
      minClusterSize: 2,
      minSamples: 1,
      membershipScoreColumn: "membership",
      outlierScoreColumn: "outlier",
    }).run();
    assert(
      (await table.getData()).every((row) =>
        Number.isFinite(row.membership) && Number.isFinite(row.outlier)
      ),
    );
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("hdbscan defaults to noise for one group and allows opting into a single cluster", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS
      SELECT i::INTEGER AS id,[1,0]::DOUBLE[2] AS features
      FROM range(6) rows(i)`);
    const table = sdb.newTable("source");
    await table.hdbscan("features", "cluster").run();
    assertEquals(
      (await table.getData()).map((row) => row.cluster),
      new Array(6).fill("noise"),
    );
    assertEquals(Object.keys(await table.getTypes()), [
      "id",
      "features",
      "cluster",
    ]);
    await table.hdbscan("features", "singleCluster", {
      allowSingleCluster: true,
    }).run();
    assertEquals(
      (await table.getData()).map((row) => row.singleCluster),
      new Array(6).fill("cluster-0"),
    );
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("hdbscan handles all noise, exact string labels, and antipodal cosine clusters", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS
      SELECT i::INTEGER AS id,[i::DOUBLE]::DOUBLE[1] AS features
      FROM range(6) rows(i)`);
    const table = sdb.newTable("source");
    await table.hdbscan("features", "cluster", {
      minClusterSize: 3,
      minSamples: 1,
      allowSingleCluster: false,
      membershipScoreColumn: "membership",
      outlierScoreColumn: "outlier",
    }).run();
    const noise = await table.getData();
    assertEquals(noise.map((row) => row.cluster), new Array(6).fill("noise"));
    assertEquals(noise.map((row) => row.membership), new Array(6).fill(0));
    assertEquals((await table.getTypes()).cluster, "VARCHAR");

    await sdb.customQuery(
      `CREATE OR REPLACE TABLE source AS SELECT * FROM (VALUES
      (0,[1,0]::DOUBLE[2]), (1,[1,0]::DOUBLE[2]), (2,[1,0]::DOUBLE[2]),
      (3,[-1,0]::DOUBLE[2]), (4,[-1,0]::DOUBLE[2]), (5,[-1,0]::DOUBLE[2])
    ) rows(id,features)`,
    );
    await table.hdbscan("features", "cluster", {
      minClusterSize: 3,
      minSamples: 1,
      metric: "cosine",
      allowSingleCluster: false,
    }).run();
    const labels = (await table.getData()).map((row) => String(row.cluster));
    assertEquals(new Set(labels.slice(0, 3)).size, 1);
    assertEquals(new Set(labels.slice(3)).size, 1);
    assert(labels[0] !== labels[3]);
    assert(labels.every((label) => label.startsWith("cluster-")));
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("hdbscan approximate full-candidate cases quantify zero reference deviation", async () => {
  for (const reference of fixture.cases) {
    const sdb = new SimpleDB();
    try {
      const dimensions = reference.vectors[0].length;
      await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
        ${
        reference.vectors.map((vector, index) =>
          `(${index},[${vector.join(",")}]::DOUBLE[${dimensions}])`
        ).join(",")
      }) rows(id,features)`);
      const table = sdb.newTable("source");
      await table.hdbscan("features", "cluster", {
        minClusterSize: reference.minClusterSize,
        minSamples: reference.minSamples,
        metric: reference.metric,
        allowSingleCluster: fixture.referenceSettings.allow_single_cluster,
        approximate: true,
        membershipScoreColumn: "membership",
        outlierScoreColumn: "outlier",
      }).run();
      const data = await table.getData();
      assertSamePartition(
        data.map((row) => clusterNumber(row.cluster)),
        reference.labels,
      );
      assertClose(
        data.map((row) => Number(row.membership)),
        reference.probabilities,
      );
      assertClose(
        data.map((row) => Number(row.outlier)),
        reference.outlierScores,
      );
      assertEquals(await scratchRelations(sdb), []);
    } finally {
      await sdb.close();
    }
  }
});

Deno.test("hdbscan supports mixed scalar types, fixed ARRAY, LIST, and explicit scaling chains", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("source");
    const representations = [
      {
        columns: ["x", "y"] as string | string[],
        projection: "x::SMALLINT AS x,y::DECIMAL(18,3) AS y",
      },
      {
        columns: "features" as string | string[],
        projection: "[x,y]::INTEGER[2] AS features",
      },
      {
        columns: "features" as string | string[],
        projection: "[x,y]::BIGNUM[] AS features",
      },
    ];
    let expected: number[] | undefined;
    for (const { columns, projection } of representations) {
      await sdb.customQuery(`CREATE OR REPLACE TABLE source AS
        SELECT id,${projection},label FROM (VALUES
          (30,0,0,'a'), (10,0,1,'b'), (20,1,0,'c'),
          (40,10,10,'d'), (50,10,11,'e'), (60,11,10,'f')
        ) rows(id,x,y,label)`);
      const before = await table.getData();
      const typesBefore = await table.getTypes();
      await table.hdbscan(columns, "cluster", {
        minClusterSize: 3,
        minSamples: 1,
        allowSingleCluster: false,
      }).run();
      const data = await table.getData();
      const actual = data.map((row) => clusterNumber(row.cluster));
      if (expected === undefined) expected = actual;
      else assertSamePartition(actual, expected);
      assertEquals(
        data.map(({ cluster: _cluster, ...row }) => row),
        before,
      );
      assertEquals(await table.getTypes(), {
        ...typesBefore,
        cluster: "VARCHAR",
      });
    }

    await sdb.customQuery(
      `CREATE OR REPLACE TABLE source AS SELECT * FROM (VALUES
      (0,0.0,0.0), (1,0.0,1.0), (2,1.0,0.0),
      (3,10.0,10.0), (4,10.0,11.0), (5,11.0,10.0)
    ) rows(id,x,y)`,
    );
    await table.normalize("x", "scaledX")
      .zScore("y", "scaledY")
      .rowToVector(["x", "y"], "features", { type: "double" })
      .normalizeVector("features", "scaledFeatures")
      .hdbscan(["scaledX", "scaledY"], "scalarCluster", {
        minClusterSize: 3,
        minSamples: 1,
        allowSingleCluster: false,
      })
      .hdbscan("scaledFeatures", "vectorCluster", {
        minClusterSize: 3,
        minSamples: 1,
        allowSingleCluster: false,
      })
      .run();
    const scaled = await table.getData();
    assertSamePartition(
      scaled.map((row) => clusterNumber(row.scalarCluster)),
      scaled.map((row) => clusterNumber(row.vectorCluster)),
    );
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("hdbscan uses raw feature scales until the caller explicitly normalizes", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
      (0,0.0,0.0),(1,0.1,1000.0),(2,0.2,2000.0),
      (3,10.0,0.0),(4,10.1,1000.0),(5,10.2,2000.0)
    ) rows(id,x,y)`);
    const table = sdb.newTable("source");
    await table.hdbscan(["x", "y"], "raw", {
      minClusterSize: 3,
      minSamples: 1,
      allowSingleCluster: false,
    })
      .normalize("x", "scaledX")
      .normalize("y", "scaledY")
      .hdbscan(["scaledX", "scaledY"], "scaled", {
        minClusterSize: 3,
        minSamples: 1,
        allowSingleCluster: false,
      }).run();
    const data = await table.getData();
    assertEquals(data.map((row) => row.raw), new Array(6).fill("noise"));
    assertSamePartition(
      data.map((row) => clusterNumber(row.scaled)),
      [0, 0, 0, 1, 1, 1],
    );
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("hdbscan validates options and small-input boundaries without clamping", async () => {
  const invalidOptions: [unknown, string][] = [
    [{ minClusterSize: 1 }, "minClusterSize must be a safe integer"],
    [{ minClusterSize: 2.5 }, "minClusterSize must be a safe integer"],
    [{ minClusterSize: Infinity }, "minClusterSize must be a safe integer"],
    [{ minSamples: 0 }, "minSamples must be a safe integer"],
    [{ minSamples: 1.5 }, "minSamples must be a safe integer"],
    [{ minSamples: NaN }, "minSamples must be a safe integer"],
    [{ metric: "manhattan" }, 'metric must be "euclidean" or "cosine"'],
    [{ allowSingleCluster: 1 }, "allowSingleCluster must be a boolean"],
    [{ approximate: "yes" }, "approximate must be a boolean"],
    [{ membershipScoreColumn: 1 }, "membershipScoreColumn must be a string"],
    [{ outlierScoreColumn: false }, "outlierScoreColumn must be a string"],
  ];
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS
      SELECT i::INTEGER AS id,[i::DOUBLE]::DOUBLE[1] AS features
      FROM range(6) rows(i)`);
    const table = sdb.newTable("source");
    const before = await table.getData();
    for (const [options, message] of invalidOptions) {
      await assertRejects(
        () => table.hdbscan("features", "cluster", options as never).run(),
        Error,
        message,
      );
      assertEquals(await table.getData(), before);
      assertEquals(await scratchRelations(sdb), []);
    }

    await sdb.customQuery(`CREATE OR REPLACE TABLE source AS
      SELECT i::INTEGER AS id,[i::DOUBLE]::DOUBLE[1] AS features
      FROM range(5) rows(i)`);
    await assertRejects(
      () => table.hdbscan("features", "cluster").run(),
      Error,
      "minSamples is 5 (defaulted from minClusterSize), but 5 rows provide at most 4 other points",
    );
    await assertRejects(
      () =>
        table.hdbscan("features", "cluster", {
          minClusterSize: 2,
          minSamples: 5,
        }).run(),
      Error,
      "Set minSamples between 1 and 4, or provide at least 6 rows",
    );
    await assertRejects(
      () =>
        table.hdbscan("features", "cluster", {
          minClusterSize: 6,
          minSamples: 1,
        }).run(),
      Error,
      "minClusterSize is 6, but the input has 5 rows",
    );
    await sdb.customQuery(`CREATE OR REPLACE TABLE source AS
      SELECT 0::INTEGER AS id,[0.0]::DOUBLE[1] AS features`);
    await assertRejects(
      () =>
        table.hdbscan("features", "cluster", {
          minClusterSize: 2,
          minSamples: 1,
        }).run(),
      Error,
      "requires at least 2 rows",
    );

    await sdb.customQuery(`CREATE OR REPLACE TABLE source AS
      SELECT i::INTEGER AS id,[0.0]::DOUBLE[1] AS features
      FROM range(2) rows(i)`);
    await table.hdbscan("features", "cluster", {
      minClusterSize: 2,
      minSamples: 1,
    }).run();
    assertEquals((await table.getData()).map((row) => row.cluster), [
      "noise",
      "noise",
    ]);

    await sdb.customQuery(`CREATE OR REPLACE TABLE source AS
      SELECT i::INTEGER AS id,[0.0]::DOUBLE[1] AS features
      FROM range(5) rows(i)`);
    await table.hdbscan("features", "cluster", {
      minClusterSize: 5,
      minSamples: 4,
      allowSingleCluster: true,
    }).run();
    assertEquals(
      (await table.getData()).map((row) => row.cluster),
      new Array(5).fill("cluster-0"),
    );
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("hdbscan rejects malformed and non-finite features with no publication", async () => {
  const cases: {
    sql: string;
    columns: string | string[];
    options?: { metric?: "euclidean" | "cosine" };
    message: string;
  }[] = [
    {
      sql: `CREATE TABLE source AS SELECT * FROM (VALUES
        (1.0,2.0),(NULL,3.0),(4.0,'Infinity'::DOUBLE),(5.0,6.0)
      ) rows(x,y)`,
      columns: ["x", "y"],
      message: "2 invalid rows",
    },
    {
      sql: `CREATE TABLE source AS SELECT * FROM (VALUES
        ([1.0,2.0]::DOUBLE[]),(NULL::DOUBLE[]),
        ([3.0,NULL]::DOUBLE[]),([4.0,'NaN'::DOUBLE]::DOUBLE[])
      ) rows(features)`,
      columns: "features",
      message: 'Column "features" has 3 invalid rows',
    },
    {
      sql: `CREATE TABLE source AS SELECT * FROM (VALUES
        ([]::INTEGER[]),([1]::INTEGER[])
      ) rows(features)`,
      columns: "features",
      message: "empty vector",
    },
    {
      sql: `CREATE TABLE source AS SELECT * FROM (VALUES
        ([1]::INTEGER[]),([2,3]::INTEGER[]),([4]::INTEGER[])
      ) rows(features)`,
      columns: "features",
      message: "equal dimensions",
    },
    {
      sql:
        `CREATE TABLE source AS SELECT i,[0.0,CASE WHEN i=0 THEN 0.0 ELSE i::DOUBLE END]::DOUBLE[2] AS features
        FROM range(3) rows(i)`,
      columns: "features",
      options: { metric: "cosine" },
      message: "nonzero vectors",
    },
    {
      sql:
        `CREATE TABLE source AS SELECT i,[CASE WHEN i=0 THEN -1.7976931348623157e308 ELSE 1.7976931348623157e308 END]::DOUBLE[1] AS features
        FROM range(3) rows(i)`,
      columns: "features",
      message: "non-finite value",
    },
  ];
  for (const testCase of cases) {
    const sdb = new SimpleDB();
    try {
      await sdb.customQuery(testCase.sql);
      const table = sdb.newTable("source");
      const before = await table.getData();
      await assertRejects(
        () =>
          table.hdbscan(testCase.columns, "cluster", {
            minClusterSize: 2,
            minSamples: 1,
            ...testCase.options,
          }).run(),
        Error,
        testCase.message,
      );
      assertEquals(await table.getData(), before);
      assertEquals(await scratchRelations(sdb), []);
    } finally {
      await sdb.close();
    }
  }
});

Deno.test("hdbscan rejects invalid feature specifications and all output collisions early", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT
      NULL::DOUBLE[1] AS features,42 AS "Cluster",'keep' AS "É"`);
    const table = sdb.newTable("source");
    const before = await table.getData();
    for (
      const [output, options] of [
        ["cluster", { membershipScoreColumn: "CLUSTER" }],
        [
          "group",
          { membershipScoreColumn: "score", outlierScoreColumn: "SCORE" },
        ],
      ] as const
    ) {
      await assertRejects(
        () => table.hdbscan("features", output, options).run(),
        Error,
        options.membershipScoreColumn === "CLUSTER"
          ? "source column already exists"
          : "refer to the same column",
      );
      assertEquals(await table.getData(), before);
      assertEquals(await scratchRelations(sdb), []);
    }

    await sdb.customQuery(
      `CREATE OR REPLACE TABLE source AS SELECT * FROM (VALUES
      (0.0,'a','x'),(1.0,'b','y'),(2.0,'c','z')
    ) rows(x,label,"É")`,
    );
    for (
      const [columns, message] of [
        [[], "at least one numeric scalar column"],
        [["x", "X"], "duplicate input column"],
        [["missing"], "could not find column"],
        [["label"], "not numeric scalars"],
        ["x", "numeric LIST or ARRAY column"],
      ] as [string | string[], string][]
    ) {
      await assertRejects(
        () =>
          table.hdbscan(columns, "cluster", {
            minClusterSize: 2,
            minSamples: 1,
          }).run(),
        Error,
        message,
      );
      assertEquals(await scratchRelations(sdb), []);
    }
    await table.hdbscan(["x"], "é", {
      minClusterSize: 2,
      minSamples: 1,
    }).run();
    assertEquals(Object.keys(await table.getTypes()), ["x", "label", "É", "é"]);
  } finally {
    await sdb.close();
  }
});

Deno.test("hdbscan snapshots inputs, composes in the queue, and is exactly repeatable", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
      (30,0.0,0.0,true),(10,0.0,1.0,true),(20,1.0,0.0,true),
      (40,10.0,10.0,true),(50,10.0,11.0,true),(60,11.0,10.0,true),
      (70,100.0,100.0,false)
    ) rows(id,x,y,keep)`);
    const table = sdb.newTable("source");
    const columns = ["x", "y"];
    const options = {
      minClusterSize: 3,
      minSamples: 1,
      allowSingleCluster: false,
    };
    table.filter("keep")
      .hdbscan(columns, "first", options)
      .hdbscan(["x", "y"], "second", options)
      .selectColumns(["id", "first", "second"]);
    columns[0] = "missing";
    options.minSamples = 99;
    const data = await table.getData();
    assertEquals(data.map((row) => row.id), [30, 10, 20, 40, 50, 60]);
    assertEquals(data.map((row) => row.first), data.map((row) => row.second));
    assertSamePartition(data.map((row) => clusterNumber(row.first)), [
      0,
      0,
      0,
      1,
      1,
      1,
    ]);
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("hdbscan preserves file-backed order, exact payload types, and indexes", async () => {
  const directory = await Deno.makeTempDir({ prefix: "sda-hdbscan-" });
  const sdb = new SimpleDB({ file: `${directory}/analysis.duckdb` });
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT id,
      [x,y]::FLOAT[2] AS "Feature "" values",
      (9007199254000000::BIGINT+id) AS row_id,
      (123456789.123456789::DECIMAL(18,9)+id) AS weight,
      '{"value":[1,2]}'::JSON AS payload,
      DATE '2020-01-01'+id AS origin
      FROM (VALUES
        (30,0,0),(10,0,1),(20,1,0),(40,10,10),(50,10,11),(60,11,10)
      ) rows(id,x,y);
      CREATE INDEX source_id ON source(id)`);
    const table = sdb.newTable("source");
    const before = await table.getData();
    const typesBefore = await table.getTypes();
    await table.hdbscan('Feature " values', "cluster", {
      minClusterSize: 3,
      minSamples: 1,
      allowSingleCluster: false,
      membershipScoreColumn: "membership",
      outlierScoreColumn: "outlier",
    }).run();
    const after = await table.getData();
    assertEquals(
      after.map(({ cluster: _c, membership: _m, outlier: _o, ...row }) => row),
      before,
    );
    assertEquals(after.map((row) => row.id), [30, 10, 20, 40, 50, 60]);
    assertEquals(await table.getTypes(), {
      ...typesBefore,
      cluster: "VARCHAR",
      membership: "DOUBLE",
      outlier: "DOUBLE",
    });
    assertEquals(
      (await sdb.connection!.runAndReadAll(
        "SELECT index_name FROM duckdb_indexes() WHERE table_name='source'",
      )).getRowsJS(),
      [["source_id"]],
    );
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
    await Deno.remove(directory, { recursive: true });
  }
});

for (const approximate of [false, true]) {
  Deno.test(`hdbscan ${approximate ? "approximate" : "exact"} rolls back all outputs and cleans scratch after commit failure`, async () => {
    const sdb = new SimpleDB();
    try {
      await sdb.customQuery(
        `CREATE TABLE source AS SELECT id,[x,y]::DOUBLE[2] AS features
      FROM (VALUES
        (1,0,0),(2,0,1),(3,1,0),(4,10,10),(5,10,11),(6,11,10)
      ) rows(id,x,y);
      CREATE UNIQUE INDEX source_id ON source(id)`,
      );
      const table = sdb.newTable("source");
      const before = await table.getData();
      const typesBefore = await table.getTypes();
      const connection = sdb.connection!;
      const original = connection.run;
      const failure = new Error("Simulated HDBSCAN publication commit failure");
      connection.run = function (...args) {
        if (args[0] === "COMMIT") return Promise.reject(failure);
        return original.apply(this, args);
      };
      try {
        const error = await assertRejects(() =>
          table.hdbscan("features", "cluster", {
            minClusterSize: 3,
            minSamples: 1,
            approximate,
            allowSingleCluster: false,
            membershipScoreColumn: "membership",
            outlierScoreColumn: "outlier",
          }).run()
        );
        assertStrictEquals(error, failure);
      } finally {
        connection.run = original;
      }
      assertEquals(await table.getData(), before);
      assertEquals(await table.getTypes(), typesBefore);
      assertEquals(
        (await connection.runAndReadAll(
          "SELECT index_name FROM duckdb_indexes() WHERE table_name='source'",
        )).getRowsJS(),
        [["source_id"]],
      );
      assertEquals(await scratchRelations(sdb), []);
    } finally {
      await sdb.close();
    }
  });
}

Deno.test("hdbscan validates output identifiers before feature preparation", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(
      "CREATE TABLE source AS SELECT NULL::DOUBLE[1] AS features",
    );
    const table = sdb.newTable("source");
    const before = await table.getData();
    for (
      const [name, options] of [
        ["", {}],
        ["bad\0name", {}],
        ["cluster", { membershipScoreColumn: "" }],
        ["cluster", { outlierScoreColumn: "bad\0name" }],
      ] as const
    ) {
      await assertRejects(
        () => table.hdbscan("features", name, options).run(),
        Error,
        "non-empty strings without null characters",
      );
      assertEquals(await table.getData(), before);
      assertEquals(await scratchRelations(sdb), []);
    }
    await assertRejects(
      () => table.hdbscan("features", undefined as never).run(),
      Error,
      "newColumn must be a string",
    );
    assertEquals(await table.getData(), before);
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

for (const approximate of [false, true]) {
  Deno.test(`hdbscan ${approximate ? "approximate" : "exact"} cosine preserves partitions and scores at extreme vector scales`, async () => {
    const reference = fixture.cases.find((entry) => entry.metric === "cosine")!;
    const sdb = new SimpleDB();
    try {
      for (const [index, scale] of [1e100, 1e-100, 1e200, 1e-200].entries()) {
        await sdb.customQuery(
          `CREATE OR REPLACE TABLE scaled_source_${index} AS SELECT * FROM (VALUES
        ${
            reference.vectors.map((vector, id) =>
              `(${id},[${
                vector.map((value) => value * scale).join(",")
              }]::DOUBLE[${vector.length}])`
            ).join(",")
          }
      ) rows(id,features)`,
        );
        const table = sdb.newTable(`scaled_source_${index}`);
        const before = await table.getData();
        const types = await table.getTypes();
        await table.hdbscan("features", "cluster", {
          metric: "cosine",
          approximate,
          minClusterSize: reference.minClusterSize,
          minSamples: reference.minSamples,
          allowSingleCluster: fixture.referenceSettings.allow_single_cluster,
          membershipScoreColumn: "membership",
          outlierScoreColumn: "outlier",
        }).run();
        const data = await table.getData();
        assertSamePartition(
          data.map((row) => clusterNumber(row.cluster)),
          reference.labels,
        );
        assertClose(
          data.map((row) => Number(row.membership)),
          reference.probabilities,
        );
        assertClose(
          data.map((row) => Number(row.outlier)),
          reference.outlierScores,
        );
        assertEquals(
          data.map(({ id, features }) => ({ id, features })),
          before,
        );
        assertEquals((await table.getTypes()).features, types.features);
        assertEquals(await scratchRelations(sdb), []);
      }
    } finally {
      await sdb.close();
    }
  });
}

Deno.test("hdbscan Euclidean preserves results under a large common offset", async () => {
  const sdb = new SimpleDB();
  try {
    let expected:
      | { cluster: unknown; membership: unknown; outlier: unknown }[]
      | undefined;
    for (const x of [0, 1e160]) {
      const table = sdb.newTable().loadArray(
        [0, 1, 2, 10, 11, 12].map((y) => ({ x, y })),
      );
      const before = await table.getData();
      const types = await table.getTypes();
      const data = await table.hdbscan(["x", "y"], "cluster", {
        minClusterSize: 2,
        minSamples: 1,
        membershipScoreColumn: "membership",
        outlierScoreColumn: "outlier",
      }).getData();
      const results = data.map(({ cluster, membership, outlier }) => ({
        cluster,
        membership,
        outlier,
      }));
      if (expected === undefined) {
        expected = results;
        assertSamePartition(data.map((row) => clusterNumber(row.cluster)), [
          0,
          0,
          0,
          1,
          1,
          1,
        ]);
      } else assertEquals(results, expected);
      assertEquals(data.map(({ x, y }) => ({ x, y })), before);
      const afterTypes = await table.getTypes();
      assertEquals({ x: afterTypes.x, y: afterTypes.y }, types);
      assertEquals(await scratchRelations(sdb), []);
    }
  } finally {
    await sdb.close();
  }
});
