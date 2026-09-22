interface CommandOptions {
  cwd: string;
  env?: Record<string, string>;
}

interface PackReport {
  name: string;
  version: string;
  size: number;
  unpackedSize: number;
  entryCount: number;
  files: { path: string }[];
}

const decoder = new TextDecoder();
const root = new URL("../", import.meta.url);
const rootPath = root.pathname;
const npmPath = new URL("npm/", root).pathname;
const denoConfig = JSON.parse(
  await Deno.readTextFile(new URL("deno.json", root)),
) as {
  name: string;
  version: string;
  keywords: string[];
  exports: Record<string, string>;
};

async function run(
  command: string,
  args: string[],
  options: CommandOptions,
): Promise<string> {
  const output = await new Deno.Command(command, {
    args,
    cwd: options.cwd,
    env: options.env,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const stdout = decoder.decode(output.stdout);
  const stderr = decoder.decode(output.stderr);
  if (!output.success) {
    throw new Error(
      `${command} ${
        args.join(" ")
      } failed with exit code ${output.code}\n${stdout}${stderr}`,
    );
  }
  return stdout;
}

function readPackReport(value: unknown): PackReport {
  let report: unknown;
  if (Array.isArray(value)) {
    report = value[0];
  } else if (value !== null && typeof value === "object") {
    report = Object.values(value)[0];
  }
  if (
    report === null || typeof report !== "object" ||
    !("files" in report) || !Array.isArray(report.files)
  ) {
    throw new Error("npm pack returned an unexpected report");
  }
  return report as PackReport;
}

const packageName = JSON.stringify(denoConfig.name);
const integrationAssertions = denoConfig.name ===
    "@nshiab/simple-data-analysis"
  ? `
if (
  typeof SimpleTable.prototype.writeChart !== "function" ||
  typeof SimpleTable.prototype.aiEmbeddings !== "function"
) {
  throw new Error("Expected SDA integration methods");
}`
  : "";
const helperEsmAssertions = denoConfig.exports["./helpers"]
  ? `
const helpers = await import(${JSON.stringify(`${denoConfig.name}/helpers`)});
if (
  typeof helpers.createDirectory !== "function" ||
  typeof helpers.queueAsyncBarrier !== "function"
) {
  throw new Error("Expected core helper exports");
}`
  : "";
const helperCjsAssertions = denoConfig.exports["./helpers"]
  ? `
const helpers = require(${JSON.stringify(`${denoConfig.name}/helpers`)});
if (
  typeof helpers.createDirectory !== "function" ||
  typeof helpers.queueAsyncBarrier !== "function"
) {
  throw new Error("Expected core helper exports");
}`
  : "";

const operationAssertions = `
if (typeof SimpleDB !== "function" || typeof SimpleTable !== "function") {
  throw new Error("Expected SimpleDB and SimpleTable exports");
}
${integrationAssertions}
const sdb = new SimpleDB();
try {
  const table = sdb
    .newTable("smoke")
    .loadArray([
      { id: 1, value: 2 },
      { id: 2, value: 4 },
      { id: 3, value: 1 },
    ])
    .filter("value >= 2")
    .sort({ value: "desc" });
  if (!(table instanceof SimpleTable)) {
    throw new Error("newTable() returned the wrong class");
  }
  const actual = JSON.stringify(await table.getData());
  const expected = JSON.stringify([
    { id: 2, value: 4 },
    { id: 1, value: 2 },
  ]);
  if (actual !== expected) {
    throw new Error(\`Expected \${expected}, received \${actual}\`);
  }
  const jsonTable = sdb.newTable("json_smoke").loadArray([{
    payload: { tags: ["station"], active: true },
    vector: [1, 2, 3],
  }], { columnTypes: { payload: "JSON", vector: "FLOAT[3]" } });
  const jsonTypes = await jsonTable.getTypes();
  const jsonRows = await jsonTable.getData();
  if (jsonTypes.payload !== "JSON" || JSON.parse(jsonRows[0].payload).tags[0] !== "station") {
    throw new Error("Expected explicitly typed JSON ingestion");
  }
  if (JSON.stringify(jsonRows[0].vector) !== JSON.stringify([1, 2, 3])) {
    throw new Error("Expected vector elements from getData()");
  }
  const typedTable = sdb.newTable("typed_smoke").loadArray([{
    payload: '{"count":3}', vector: "[0.25,0.5,0.75]", geom: "POINT (-73 45)",
  }]).convert({ payload: "JSON", vector: "FLOAT[3]", geom: "GEOMETRY('EPSG:4326')" })
    .addColumn("copy", "json", "payload")
    .addColumn("embedding", "float[3]", "vector");
  const typedTypes = await typedTable.getTypes();
  const typedGeo = await typedTable.getGeoData();
  if (typedTypes.copy !== "JSON" || typedTypes.embedding !== "FLOAT[3]" ||
      typedTypes.geom !== "GEOMETRY('EPSG:4326')" ||
      JSON.stringify(typedGeo.features[0].geometry.coordinates) !== "[-73,45]" ||
      JSON.stringify(typedGeo.features[0].properties.embedding) !== "[0.25,0.5,0.75]") {
    throw new Error("Expected JSON, vector and geometry creation and conversion");
  }
  const emptyTypes = await sdb.newTable("empty_typed_smoke").setTypes({
    payload: "JSON", vector: "FLOAT[3]", geom: "GEOMETRY('EPSG:4326')",
  }).getTypes();
  if (emptyTypes.payload !== "JSON" || emptyTypes.vector !== "FLOAT[3]" ||
      emptyTypes.geom !== "GEOMETRY('EPSG:4326')") {
    throw new Error("Expected JSON, vector and geometry schema creation");
  }
  const projection = await sdb.newTable("umap_smoke").loadArray([
    { id: 1, vector: [1, 2] },
    { id: 2, vector: [2, 3] },
    { id: 3, vector: [4, 5] },
  ], { columnTypes: { vector: "FLOAT[2]" } })
    .umap("vector", { epochs: 10, seed: 42 }).getData();
  if (projection.length !== 3 || !projection.every((row) =>
    Number.isFinite(row.umapX) && Number.isFinite(row.umapY) && row.vector.length === 2)) {
    throw new Error("Expected finite UMAP coordinates and preserved embeddings");
  }
  const multivariate = sdb.newTable("multivariate_smoke").loadArray([
    { id: 1, x: 1, y: 2 },
    { id: 2, x: 2, y: 1 },
    { id: 3, x: 4, y: 5 },
    { id: 4, x: 5, y: 4 },
    { id: 5, x: 8, y: 9 },
  ])
    .rowToVector(["x", "y"], "features", { type: "double" })
    .normalizeVector("features", "scaled")
    .mahalanobis(["x", "y"], [1, 2], "distance", { similarityScoreColumn: "similarity" })
    .hdbscan("scaled", "cluster", {
      minClusterSize: 2, minSamples: 1,
      membershipScoreColumn: "membership", outlierScoreColumn: "outlier",
    });
  const multivariateRows = await multivariate.getData();
  const multivariateTypes = await multivariate.getTypes();
  if (multivariateRows.length !== 5 || multivariateTypes.features !== "DOUBLE[2]" ||
      multivariateTypes.scaled !== "DOUBLE[2]" || multivariateTypes.cluster !== "VARCHAR" ||
      multivariateTypes.similarity !== "DOUBLE" || multivariateRows[0].similarity !== 1 ||
      multivariateRows[0].distance !== 0 ||
      !multivariateRows.every((row, index) => row.id === index + 1 &&
        row.features[0] === row.x && row.features[1] === row.y &&
        row.scaled.every((value) => Number.isFinite(value) && value >= 0 && value <= 1) &&
        Number.isFinite(row.distance) && Number.isFinite(row.membership) &&
        Number.isFinite(row.similarity) && row.similarity >= 0 && row.similarity <= 1 &&
        Number.isFinite(row.outlier) &&
        (row.cluster === "noise" || row.cluster.startsWith("cluster-")))) {
    throw new Error("Expected multivariate methods to compose and preserve source rows");
  }
  await sdb.customQuery('CREATE TABLE prototype_smoke AS SELECT i::DOUBLE AS "__proto__" FROM range(3) rows(i)');
  const prototypeTable = sdb.newTable("prototype_smoke")
    .rowToVector(["__proto__"], "features")
    .normalizeVector("features", "features")
    .mahalanobis(["__proto__"], [1], "distance");
  const prototypeTypes = await prototypeTable.getTypes();
  const prototypeRows = await prototypeTable.getData();
  if (!Object.hasOwn(prototypeTypes, "__proto__") || prototypeTypes["__proto__"] !== "DOUBLE" ||
      !prototypeRows.every((row, index) => Object.hasOwn(row, "__proto__") &&
        row["__proto__"] === index && Object.getPrototypeOf(row) === Object.prototype) ||
      JSON.stringify(prototypeRows) !== JSON.stringify([
        { ["__proto__"]: 0, features: [0], distance: 1 },
        { ["__proto__"]: 1, features: [0.5], distance: 0 },
        { ["__proto__"]: 2, features: [1], distance: 1 },
      ])) {
    throw new Error("Expected prototype-named numeric columns to work across multivariate methods");
  }
  await sdb.customQuery('CREATE TABLE prototype_payload_smoke AS SELECT {retained: true} AS "__proto__"');
  const [prototypePayload] = await sdb.newTable("prototype_payload_smoke").getData();
  if (!Object.hasOwn(prototypePayload, "__proto__") || !prototypePayload["__proto__"].retained ||
      Object.getPrototypeOf(prototypePayload) !== Object.prototype) {
    throw new Error("Expected prototype-named payload columns to preserve data and row prototypes");
  }
} finally {
  await sdb.close();
}`;

const esmSmoke = `
const { SimpleDB, SimpleTable } = await import(${packageName});
${helperEsmAssertions}
${operationAssertions}
`;
const cjsSmoke = `
const { SimpleDB, SimpleTable } = require(${packageName});
${helperCjsAssertions}
(async () => {
  ${operationAssertions}
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;

const npmCache = await Deno.makeTempDir({ prefix: "sda-npm-smoke-" });
const env = { NPM_CONFIG_CACHE: npmCache };
try {
  console.log(`Building ${denoConfig.name}@${denoConfig.version} for npm...`);
  await run(
    Deno.execPath(),
    [
      "run",
      "--no-lock",
      "-A",
      "jsr:@nshiab/deno-to-npm",
    ],
    { cwd: rootPath, env },
  );

  for (
    const [runtime, command, args] of [
      ["Node ESM", "node", ["--input-type=module", "--eval", esmSmoke]],
      ["Node CommonJS", "node", ["--eval", cjsSmoke]],
      ["Bun ESM", "bun", ["--eval", esmSmoke]],
      ["Bun CommonJS", "bun", ["--eval", cjsSmoke]],
    ] as const
  ) {
    await run(command, [...args], { cwd: npmPath, env });
    console.log(`Passed ${runtime} smoke test.`);
  }

  const packReport = readPackReport(
    JSON.parse(
      await run("npm", ["pack", "--dry-run", "--json"], {
        cwd: npmPath,
        env,
      }),
    ),
  );
  const generatedPackage = JSON.parse(
    await Deno.readTextFile(new URL("package.json", new URL("npm/", root))),
  ) as { keywords?: string[] };
  if (
    JSON.stringify(generatedPackage.keywords) !==
      JSON.stringify(denoConfig.keywords)
  ) {
    throw new Error("npm package keywords do not match deno.json");
  }
  const paths = new Set(packReport.files.map(({ path }) => path));
  for (
    const required of [
      "package.json",
      "README.md",
      "LICENSE",
      "llm.md",
      "llms.txt",
      "esm/index.js",
      "esm/index.d.ts",
      "script/index.js",
      "script/index.d.ts",
    ]
  ) {
    if (!paths.has(required)) {
      throw new Error(`npm package is missing ${required}`);
    }
  }
  const excludedPrefixes = [
    "node_modules/",
    "test/",
    "benchmarks/",
    ".github/",
  ];
  const unexpected = [...paths].filter((path) =>
    excludedPrefixes.some((prefix) => path.startsWith(prefix))
  );
  if (unexpected.length > 0) {
    throw new Error(`npm package contains unexpected files: ${unexpected[0]}`);
  }
  if (
    packReport.name !== denoConfig.name ||
    packReport.version !== denoConfig.version
  ) {
    throw new Error(
      `npm package identity is ${packReport.name}@${packReport.version}`,
    );
  }
  console.log(
    `Passed npm pack check (${packReport.entryCount} files, ${packReport.size} bytes packed, ${packReport.unpackedSize} bytes unpacked).`,
  );
} finally {
  await Deno.remove(npmCache, { recursive: true }).catch(() => undefined);
}
