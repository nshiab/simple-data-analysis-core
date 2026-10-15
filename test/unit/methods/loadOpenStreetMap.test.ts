import serveFixture from "../../helpers/serveFixture.ts";
import { mkdtemp } from "node:fs/promises";
import { test, expect } from "vite-plus/test";
import { ok as assert } from "node:assert/strict";
import { assertThrows, assertRejects } from "../../helpers/assertions.ts";
import { copyFile as nodeCopyFile } from "node:fs/promises";

import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import { downloadOsmToTemporaryFile } from "../../../src/helpers/osmFiles.ts";
import { generateOverpassQuery } from "../../../src/methods/loadOpenStreetMap.ts";

const bbox = {
  west: -73.6,
  south: 45.5,
  east: -73.59,
  north: 45.51,
};

test("generateOverpassQuery creates one nwr selection", () => {
  expect(generateOverpassQuery(bbox, ['["amenity"="school"]'], 60)).toStrictEqual(
    `[out:xml][timeout:60];nwr["amenity"="school"](45.5,-73.6,45.51,-73.59);(._;>;);out body;`,
  );
});

test("generateOverpassQuery creates a union for multiple filters", () => {
  expect(
    generateOverpassQuery(bbox, ['["amenity"="school"]', '["amenity"="college"]']),
  ).toStrictEqual(
    `[out:xml];(nwr["amenity"="school"](45.5,-73.6,45.51,-73.59);nwr["amenity"="college"](45.5,-73.6,45.51,-73.59););(._;>;);out body;`,
  );
});

test("loadOpenStreetMap loads an OSM XML file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("osmFixture");
  table.loadOpenStreetMap("test/geodata/files/osm-fixture.osm", {
    cache: false,
  });

  expect((await table.getTypes()).geom).toStrictEqual("GEOMETRY('EPSG:4326')");
  expect(
    await sdb.customQuery(
      `SELECT kind, type, id, ST_AsText(geom) AS wkt
      FROM osmFixture WHERE id IN (1, 10, 20) ORDER BY id`,
      { returnData: true },
    ),
  ).toStrictEqual([
    { kind: "node", type: "node", id: 1, wkt: "POINT (-73.599 45.501)" },
    {
      kind: "area",
      type: "way",
      id: 10,
      wkt: "POLYGON ((-73.598 45.502, -73.596 45.502, -73.596 45.504, -73.598 45.504, -73.598 45.502))",
    },
    {
      kind: "area",
      type: "relation",
      id: 20,
      wkt: "MULTIPOLYGON (((-73.595 45.505, -73.593 45.505, -73.593 45.507, -73.595 45.507, -73.595 45.505)))",
    },
  ]);
  await sdb.close();
});

test("loadOpenStreetMap supports filtering and projection after loading", async () => {
  const sdb = new SimpleDB();
  try {
    expect(
      await sdb
        .newTable()
        .loadOpenStreetMap("test/geodata/files/osm-fixture.osm", { cache: false })
        .filter("kind = 'node' AND ST_X(geom) < -73.5985")
        .selectColumns(["id"])
        .getData(),
    ).toStrictEqual([{ id: 1 }]);
  } finally {
    await sdb.close();
  }
});

test("loadOpenStreetMap loads an OSM PBF file", async () => {
  const file = join(tmpdir(), `${crypto.randomUUID()}.osm.pbf`);
  // Base64-encoded osmium-tool test/formats/f1.osm.pbf fixture.
  const fixture =
    "AAAADQoJT1NNSGVhZGVyGC8QIxoreJxT4vMvzg1OzkjNTdQNM9AzU+JySc0rTvXLT0ktbmJkKUktLgEAv2ALIwAAAAsKB09TTURhdGEYchBvGm54nOPi52LgYilJLS4B0sxp+flCMUJRXCwiTExMWtpcLIxAICTY8OblZs4DH+fY3Gu/ZNnUfUZBioWJgYlJiYWJkY1ZiwWoltlJoOHWEc45b95xPjk+ixPE9uIFkR/2zGd6D8QMQSwMQAAAED0gQwAAAAsKB09TTURhdGEYYhBkGl54nONS5mLgYk7LzwdRFZVVXMyKDipczEmJRVzMWsr6XCwlqcUlQrZSyhwiQiyMTMwsUiysrExsSnwcjAITdkxayirBosCowe7ELMLEJCXGIYokwQiWYJJgAgAspg+lAAAACwoHT1NNRGF0YRhTEEgaT3ic45LjYuBirqis4mJOTErmYilJLS4BinAU5+emKpQnVgqpKalwyAkxMkoxMinxcTAKTNgxaSmrBKMCowazExMLqxeThEAQEwMjABQPDQo=";
  writeFileSync(file, Buffer.from(fixture, "base64"));

  try {
    const sdb = new SimpleDB();
    const table = sdb.newTable("osmPbfFixture");
    table.loadOpenStreetMap(file, { cache: false });

    expect((await table.getTypes()).geom).toStrictEqual("GEOMETRY('EPSG:4326')");
    expect(
      await sdb.customQuery(
        `SELECT kind, type, id, ST_AsText(geom) AS wkt
        FROM osmPbfFixture WHERE id = 20`,
        { returnData: true },
      ),
    ).toStrictEqual([
      {
        kind: "line",
        type: "way",
        id: 20,
        wkt: "LINESTRING (1 1, 1.2355 2.034523, 1 3)",
      },
    ]);
    await sdb.close();
  } finally {
    rmSync(file, { force: true });
  }
});

test("loadOpenStreetMap stages and removes a remote OSM file", async () => {
  rmSync(".sda-cache", { recursive: true, force: true });
  const fixture = readFileSync("test/geodata/files/osm-fixture.osm");
  const server = await serveFixture(() => new Response(fixture));
  const url = `${server.url}/fixture.osm?download=1`;

  try {
    const sdb = new SimpleDB();
    const table = sdb.newTable();
    table.loadOpenStreetMap(url);
    expect((await table.getTypes()).geom).toStrictEqual("GEOMETRY('EPSG:4326')");
    await sdb.close();
    expect(readdirSync(".sda-cache/tmp")).toStrictEqual([]);
  } finally {
    await server.close();
    rmSync(".sda-cache", { recursive: true, force: true });
  }
});

test("loadOpenStreetMap validates its public parameters at call time", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();

  assertThrows(() => table.loadOpenStreetMap("data.geojson"), Error, ".osm or .osm.pbf");
  assertThrows(
    () => table.loadOpenStreetMap({ ...bbox, west: 200 }, { filters: "[amenity]" }),
    Error,
    "bbox.west",
  );
  assertThrows(() => table.loadOpenStreetMap(bbox), TypeError, "options.filters is required");
  assertThrows(() => table.loadOpenStreetMap(bbox, { filters: [] }), Error, "filters");
  assertThrows(
    () => table.loadOpenStreetMap(bbox, { filters: ["", "school"] }),
    Error,
    "filter keys",
  );
  assertThrows(
    () => table.loadOpenStreetMap(bbox, { filters: "[amenity]", timeout: 0 }),
    Error,
    "timeout",
  );
  assertThrows(
    () =>
      table.loadOpenStreetMap(bbox, {
        filters: "[amenity]",
        endpoint: "file:///tmp/overpass",
      }),
    Error,
    "endpoint",
  );
  assertThrows(
    () =>
      table.loadOpenStreetMap("test/geodata/files/osm-fixture.osm", {
        endpoint: "https://overpass.example/api/interpreter",
      }),
    Error,
    "options.endpoint",
  );
  assertThrows(
    () =>
      table.loadOpenStreetMap("test/geodata/files/osm-fixture.osm", {
        retries: 1,
      }),
    Error,
    "network-only",
  );
  assertThrows(
    () =>
      table.loadOpenStreetMap(bbox, {
        filters: "[amenity]",
        cache: false,
        ttl: 60,
      }),
    Error,
    "cannot be false",
  );

  await sdb.close();
});

test("loadOpenStreetMap downloads, materializes, caches, and reuses OSM data", async () => {
  rmSync(".sda-cache", { recursive: true, force: true });
  const fixture = readFileSync("test/geodata/files/osm-fixture.osm");
  let requests = 0;
  let requestBody = "";
  let acceptEncoding = "";
  let userAgent = "";
  const server = await serveFixture(async (request) => {
    requests++;
    requestBody = await request.text();
    acceptEncoding = request.headers.get("accept-encoding") ?? "";
    userAgent = request.headers.get("user-agent") ?? "";
    return new Response(fixture, {
      headers: { "content-type": "application/xml" },
    });
  });
  const endpoint = `${server.url}/interpreter`;

  try {
    const firstSdb = new SimpleDB({
      cacheVerbose: true,
    });
    const first = firstSdb.newTable("firstOsmTable");
    first.loadOpenStreetMap(bbox, {
      filters: ["amenity", "school"],
      endpoint,
      timeout: 60,
    });
    const missLogs = await captureConsoleLogs(async () => {
      expect((await first.getTypes()).geom).toStrictEqual("GEOMETRY('EPSG:4326')");
    });
    expect(missLogs).toContain("No processed cache entry matched");
    expect(missLogs).toContain("Querying Overpass");
    expect(missLogs).toContain("Processing OSM data with Osmium");
    expect(missLogs).toContain("Writing processed GeoParquet cache");
    await firstSdb.close();

    const cacheFiles = readdirSync(".sda-cache/osm");
    expect(cacheFiles.some((file) => file.endsWith(".geoparquet"))).toStrictEqual(true);
    expect(
      Object.values(
        JSON.parse(readFileSync(".sda-cache/osm/sources.json", "utf-8")) as {
          [key: string]: unknown;
        },
      ).length,
    ).toStrictEqual(1);
    expect(existsSync(".sda-cache/sources.json")).toStrictEqual(false);

    const secondSdb = new SimpleDB({
      cacheVerbose: true,
    });
    const second = secondSdb.newTable("anotherOsmTable");
    second.loadOpenStreetMap(bbox, {
      filters: ["amenity", "school"],
      endpoint,
      timeout: 60,
    });
    let rows: { [key: string]: unknown }[] | null | undefined;
    const hitLogs = await captureConsoleLogs(async () => {
      rows = await secondSdb.customQuery(
        `SELECT kind, type, id, ST_AsText(geom) AS wkt
        FROM anotherOsmTable WHERE id IN (1, 10, 20) ORDER BY id`,
        { returnData: true },
      );
    });
    expect(hitLogs).toContain("Processed cache hit.");
    expect(hitLogs).toContain("Osmium will not run");
    expect(hitLogs).toContain("Loaded");
    expect(hitLogs.includes("Querying Overpass (attempt")).toStrictEqual(false);
    expect(rows).toStrictEqual([
      { kind: "node", type: "node", id: 1, wkt: "POINT (-73.599 45.501)" },
      {
        kind: "area",
        type: "way",
        id: 10,
        wkt: "POLYGON ((-73.598 45.502, -73.596 45.502, -73.596 45.504, -73.598 45.504, -73.598 45.502))",
      },
      {
        kind: "area",
        type: "relation",
        id: 20,
        wkt: "MULTIPOLYGON (((-73.595 45.505, -73.593 45.505, -73.593 45.507, -73.595 45.507, -73.595 45.505)))",
      },
    ]);
    await secondSdb.close();

    expect(requests).toStrictEqual(1);
    expect(requestBody).toContain("data=%5Bout%3Axml%5D");
    expect(new URLSearchParams(requestBody).get("data") ?? "").toContain('nwr["amenity"="school"]');
    expect(acceptEncoding).toContain("gzip");
    expect(userAgent).toContain("simple-data-analysis-core");
    expect(existsSync(".sda-cache/tmp")).toStrictEqual(true);
    expect(readdirSync(".sda-cache/tmp")).toStrictEqual([]);

    const thirdSdb = new SimpleDB();
    const third = thirdSdb.newTable("differentOsmSource");
    third.loadOpenStreetMap(bbox, {
      filters: ["amenity", "college"],
      endpoint,
      timeout: 60,
    });
    await third.run();
    await thirdSdb.close();
    expect(requests).toStrictEqual(2);
    expect(
      Object.values(
        JSON.parse(readFileSync(".sda-cache/osm/sources.json", "utf-8")) as {
          [key: string]: unknown;
        },
      ).length,
    ).toStrictEqual(2);
  } finally {
    await server.close();
    rmSync(".sda-cache", { recursive: true, force: true });
  }
});

test("loadOpenStreetMap with cache false always requests fresh data", async () => {
  rmSync(".sda-cache", { recursive: true, force: true });
  const fixture = readFileSync("test/geodata/files/osm-fixture.osm");
  let requests = 0;
  const server = await serveFixture(() => {
    requests++;
    return new Response(fixture);
  });
  const endpoint = `${server.url}/interpreter`;

  try {
    let uncachedLogs = "";
    for (let index = 0; index < 2; index++) {
      const sdb = new SimpleDB({
        cacheVerbose: index === 0,
      });
      const table = sdb.newTable(`uncachedOsm${index}`);
      table.loadOpenStreetMap(bbox, {
        filters: ["amenity", "school"],
        endpoint,
        cache: false,
      });
      if (index === 0) {
        uncachedLogs = await captureConsoleLogs(() => table.run());
      } else {
        await table.run();
      }
      await sdb.close();
    }
    expect(uncachedLogs).toContain("Processed cache disabled.");
    expect(uncachedLogs).toContain("without reading or writing");
    expect(requests).toStrictEqual(2);
    expect(existsSync(".sda-cache/osm/sources.json")).toStrictEqual(false);
    expect(readdirSync(".sda-cache/tmp")).toStrictEqual([]);
  } finally {
    await server.close();
    rmSync(".sda-cache", { recursive: true, force: true });
  }
});

test("loadOpenStreetMap preserves a raw Overpass filter fragment", async () => {
  rmSync(".sda-cache", { recursive: true, force: true });
  const fixture = readFileSync("test/geodata/files/osm-fixture.osm");
  let requestBody = "";
  const server = await serveFixture(async (request) => {
    requestBody = await request.text();
    return new Response(fixture);
  });
  const endpoint = `${server.url}/interpreter`;

  try {
    const sdb = new SimpleDB();
    const table = sdb.newTable("rawFilterOsm");
    table.loadOpenStreetMap(bbox, {
      filters: `["amenity"~"school|college"]`,
      endpoint,
      cache: false,
    });
    await table.run();
    await sdb.close();

    expect(new URLSearchParams(requestBody).get("data") ?? "").toContain(
      'nwr["amenity"~"school|college"]',
    );
  } finally {
    await server.close();
    rmSync(".sda-cache", { recursive: true, force: true });
  }
});

test("loadOpenStreetMap does not cache failed or incomplete responses", async () => {
  rmSync(".sda-cache", { recursive: true, force: true });
  const server = await serveFixture(() => new Response("<osm><node", { status: 200 }));
  const endpoint = `${server.url}/interpreter`;

  try {
    const sdb = new SimpleDB();
    const table = sdb.newTable();
    table.loadOpenStreetMap(bbox, { filters: "[amenity]", endpoint });
    await assertRejects(() => table.run(), Error, "loadOpenStreetMap()");
    await sdb.close();

    expect(existsSync(".sda-cache/osm/sources.json")).toStrictEqual(false);
    expect(readdirSync(".sda-cache/tmp")).toStrictEqual([]);
  } finally {
    await server.close();
    rmSync(".sda-cache", { recursive: true, force: true });
  }
});

test("loadOpenStreetMap rejects well-formed Overpass error responses", async () => {
  rmSync(".sda-cache", { recursive: true, force: true });
  const responses = [
    { tag: "remark", message: "runtime error: Query timed out" },
    { tag: "error", message: "internal server error" },
  ];
  let responseIndex = 0;
  const server = await serveFixture(() => {
    const response = responses[responseIndex++];
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
        <osm version="0.6" generator="Overpass API">
          <${response.tag}>${response.message}</${response.tag}>
        </osm>`,
      { headers: { "content-type": "application/xml" } },
    );
  });
  const endpoint = `${server.url}/interpreter`;

  try {
    for (const response of responses) {
      const sdb = new SimpleDB();
      try {
        const table = sdb.newTable();
        table.loadOpenStreetMap(bbox, {
          filters: `[${response.tag}]`,
          endpoint,
        });
        await assertRejects(() => table.run(), Error, response.message);
      } finally {
        await sdb.close();
      }
    }

    expect(responseIndex).toStrictEqual(responses.length);
    expect(existsSync(".sda-cache/osm/sources.json")).toStrictEqual(false);
    expect(readdirSync(".sda-cache/tmp")).toStrictEqual([]);
  } finally {
    await server.close();
    rmSync(".sda-cache", { recursive: true, force: true });
  }
});

test("OSM requests retry transient responses and honor Retry-After", async () => {
  rmSync(".sda-cache", { recursive: true, force: true });
  const fixture = readFileSync("test/geodata/files/osm-fixture.osm");
  const originalFetch = globalThis.fetch;
  const waits: number[] = [];
  let requests = 0;
  globalThis.fetch = (() => {
    requests++;
    return Promise.resolve(
      requests === 1
        ? new Response("busy", {
            status: 503,
            headers: { "retry-after": "30" },
          })
        : new Response(fixture),
    );
  }) as typeof fetch;

  try {
    let temporaryFile = "";
    const logs = await captureConsoleLogs(async () => {
      temporaryFile = await downloadOsmToTemporaryFile(
        "https://user:password@example.test/data.osm?token=secret",
        {
          suffix: ".osm",
          retries: 1,
          retryDelay: 5,
          wait: (milliseconds) => {
            waits.push(milliseconds);
            return Promise.resolve();
          },
        },
      );
    });
    rmSync(temporaryFile, { force: true });
    expect(requests).toStrictEqual(2);
    expect(waits).toStrictEqual([30_000]);
    expect(logs).toContain("HTTP 503");
    expect(logs).toContain("Retry-After: 30");
    expect(logs.includes("password")).toStrictEqual(false);
    expect(logs.includes("secret")).toStrictEqual(false);
    expect(logs).toContain("%5BREDACTED%5D");
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(".sda-cache", { recursive: true, force: true });
  }
});

test("OSM requests do not retry nontransient responses", async () => {
  rmSync(".sda-cache", { recursive: true, force: true });
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (() => {
    requests++;
    return Promise.resolve(new Response("missing", { status: 404 }));
  }) as typeof fetch;

  try {
    const error = await assertRejects(
      () =>
        downloadOsmToTemporaryFile("https://example.test/data.osm", {
          suffix: ".osm",
          retries: 3,
          retryDelay: 0,
          wait: () => Promise.resolve(),
        }),
      Error,
      "nonretryable",
    );
    expect(requests).toStrictEqual(1);
    expect(error.message).toContain("HTTP 404");
    expect(error.message).toContain("No invalid cached data was returned");
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(".sda-cache", { recursive: true, force: true });
  }
});

test("OSM requests report retry exhaustion and total delay", async () => {
  rmSync(".sda-cache", { recursive: true, force: true });
  const originalFetch = globalThis.fetch;
  const waits: number[] = [];
  let requests = 0;
  globalThis.fetch = (() => {
    requests++;
    return Promise.resolve(new Response("busy", { status: 429 }));
  }) as typeof fetch;

  try {
    const error = await assertRejects(
      () =>
        downloadOsmToTemporaryFile("https://example.test/data.osm", {
          suffix: ".osm",
          retries: 2,
          retryDelay: 2,
          wait: (milliseconds) => {
            waits.push(milliseconds);
            return Promise.resolve();
          },
        }),
      Error,
      "configured retries were exhausted",
    );
    expect(requests).toStrictEqual(3);
    expect(waits).toStrictEqual([2_000, 4_000]);
    expect(error.message).toContain("Total retry delay: 6 seconds");
    expect(error.message).toContain("Last failure: HTTP 429");
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(".sda-cache", { recursive: true, force: true });
  }
});

test("local OSM cache retains fingerprints, bypasses safely, expires, and repairs corruption", async () => {
  rmSync(".sda-cache", { recursive: true, force: true });
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "sda-fixture-"));
  const file = join(temporaryDirectory, "fixture.osm");
  await nodeCopyFile("test/geodata/files/osm-fixture.osm", file);

  try {
    const load = async (options: { cache?: boolean; ttl?: number } = {}) => {
      const sdb = new SimpleDB({ cacheVerbose: true });
      try {
        const table = sdb.newTable();
        table.loadOpenStreetMap(file, options);
        return await captureConsoleLogs(() => table.run());
      } finally {
        await sdb.close();
      }
    };

    await load();
    const sourcesFile = ".sda-cache/osm/sources.json";
    expect(Object.keys(readSources(sourcesFile)).length).toStrictEqual(1);
    const hitLogs = await load();
    expect(hitLogs).toContain("Processed cache hit");
    expect(hitLogs).toContain("Osmium will not run");

    appendFileSync(file, "\n");
    await load();
    expect(Object.keys(readSources(sourcesFile)).length).toStrictEqual(2);

    const beforeBypass = readFileSync(sourcesFile, "utf-8");
    await load({ cache: false });
    expect(readFileSync(sourcesFile, "utf-8")).toStrictEqual(beforeBypass);

    const expiryLogs = await load({ ttl: 0 });
    expect(expiryLogs).toContain("Processed cache entry expired");
    expect(expiryLogs).toContain("matching cache file was removed");
    expect(Object.keys(readSources(sourcesFile)).length).toStrictEqual(2);

    const sources = readSources(sourcesFile);
    const newest = Object.values(sources).sort((a, b) => b.creation - a.creation)[0];
    writeFileSync(newest.file, "not parquet");
    const repairLogs = await load();
    expect(repairLogs).toContain("corrupt or unusable");
    expect(Object.keys(readSources(sourcesFile)).length).toStrictEqual(2);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    rmSync(".sda-cache", { recursive: true, force: true });
  }
});

test("remote OSM URLs retain independent processed cache entries", async () => {
  rmSync(".sda-cache", { recursive: true, force: true });
  const fixture = readFileSync("test/geodata/files/osm-fixture.osm");
  let requests = 0;
  const server = await serveFixture(() => {
    requests++;
    return new Response(fixture);
  });
  const origin = `${server.url}`;

  try {
    for (const path of ["a.osm", "b.osm", "a.osm"]) {
      const sdb = new SimpleDB();
      try {
        await sdb.newTable().loadOpenStreetMap(`${origin}/${path}`).run();
      } finally {
        await sdb.close();
      }
    }
    expect(requests).toStrictEqual(2);
    expect(Object.keys(readSources(".sda-cache/osm/sources.json")).length).toStrictEqual(2);
  } finally {
    await server.close();
    rmSync(".sda-cache", { recursive: true, force: true });
  }
});

test("an expired OSM cache entry is not returned when refresh fails", async () => {
  rmSync(".sda-cache", { recursive: true, force: true });
  const fixture = readFileSync("test/geodata/files/osm-fixture.osm");
  let requests = 0;
  const server = await serveFixture(() => {
    requests++;
    return requests === 1 ? new Response(fixture) : new Response("unavailable", { status: 503 });
  });
  const endpoint = `${server.url}/interpreter`;

  try {
    const firstSdb = new SimpleDB();
    await firstSdb
      .newTable()
      .loadOpenStreetMap(bbox, {
        filters: "[amenity]",
        endpoint,
      })
      .run();
    await firstSdb.close();

    const sourcesFile = ".sda-cache/osm/sources.json";
    const sources = readSources(sourcesFile);
    for (const source of Object.values(sources)) {
      source.creation = Date.now() - 61_000;
    }
    writeFileSync(sourcesFile, JSON.stringify(sources));

    const secondSdb = new SimpleDB();
    try {
      const table = secondSdb.newTable();
      table.loadOpenStreetMap(bbox, {
        filters: "[amenity]",
        endpoint,
        ttl: 60,
        retries: 0,
      });
      const error = await assertRejects(
        () => table.run(),
        Error,
        "No invalid cached data was returned",
      );
      expect(error.message).toContain("HTTP 503");
    } finally {
      await secondSdb.close();
    }

    expect(requests).toStrictEqual(2);
    expect(Object.keys(readSources(sourcesFile)).length).toStrictEqual(0);
    expect(
      readdirSync(".sda-cache/osm").some((file) => file.endsWith(".geoparquet")),
    ).toStrictEqual(false);
  } finally {
    await server.close();
    rmSync(".sda-cache", { recursive: true, force: true });
  }
});

test.skipIf(process.env.CI === "true")(
  "loadOpenStreetMap works with the public Overpass endpoint",
  async () => {
    const sdb = new SimpleDB();
    const table = sdb.newTable("publicOverpassSchools");

    try {
      table.loadOpenStreetMap(
        {
          west: -73.587799,
          south: 45.445078,
          east: -73.552265,
          north: 45.471086,
        },
        {
          filters: ["amenity", "school"],
          cache: false,
          timeout: 120,
        },
      );
      await table.run();

      const [summary] = (await sdb.customQuery(
        `SELECT
        count(*)::INTEGER AS featureCount,
        count(*) FILTER (WHERE geom IS NULL)::INTEGER AS missingGeometryCount,
        count(*) FILTER (
          WHERE geom IS NOT NULL AND NOT ST_IsValid(geom)
        )::INTEGER AS invalidGeometryCount
      FROM publicOverpassSchools
      WHERE tags['amenity'] = 'school';`,
        { returnData: true },
      )) as {
        featureCount: number;
        missingGeometryCount: number;
        invalidGeometryCount: number;
      }[];

      assert(summary !== undefined);
      assert(
        summary.featureCount > 0,
        "The public Overpass endpoint returned no schools for the test bbox.",
      );
      expect(summary.missingGeometryCount).toStrictEqual(0);
      expect(summary.invalidGeometryCount).toStrictEqual(0);
    } finally {
      await sdb.close();
    }
  },
);

async function captureConsoleLogs(run: () => Promise<unknown>): Promise<string> {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  try {
    await run();
  } finally {
    console.log = originalLog;
  }
  return logs.join("\n");
}

function readSources(file: string): {
  [id: string]: { file: string; creation: number };
} {
  return JSON.parse(readFileSync(file, "utf-8")) as {
    [id: string]: { file: string; creation: number };
  };
}
