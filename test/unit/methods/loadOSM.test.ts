import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import { generateOverpassQuery } from "../../../src/methods/loadOSM.ts";

const bbox = {
  west: -73.6,
  south: 45.5,
  east: -73.59,
  north: 45.51,
};

Deno.test("generateOverpassQuery creates one nwr selection", () => {
  assertEquals(
    generateOverpassQuery(bbox, ['["amenity"="school"]'], 60),
    `[out:xml][timeout:60];nwr["amenity"="school"](45.5,-73.6,45.51,-73.59);(._;>;);out body;`,
  );
});

Deno.test("generateOverpassQuery creates a union for multiple filters", () => {
  assertEquals(
    generateOverpassQuery(
      bbox,
      ['["amenity"="school"]', '["amenity"="college"]'],
    ),
    `[out:xml];(nwr["amenity"="school"](45.5,-73.6,45.51,-73.59);nwr["amenity"="college"](45.5,-73.6,45.51,-73.59););(._;>;);out body;`,
  );
});

Deno.test("loadOSM validates its public parameters at call time", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();

  assertThrows(
    () => table.loadOSM({ ...bbox, west: 200 }, { filters: "[amenity]" }),
    Error,
    "bbox.west",
  );
  assertThrows(
    () => table.loadOSM(bbox, { filters: [] }),
    Error,
    "filters",
  );
  assertThrows(
    () => table.loadOSM(bbox, { filters: ["", "school"] }),
    Error,
    "filter keys",
  );
  assertThrows(
    () => table.loadOSM(bbox, { filters: "[amenity]", timeout: 0 }),
    Error,
    "timeout",
  );
  assertThrows(
    () =>
      table.loadOSM(bbox, {
        filters: "[amenity]",
        endpoint: "file:///tmp/overpass",
      }),
    Error,
    "endpoint",
  );

  await sdb.close();
});

Deno.test("loadOSM downloads, materializes, caches, and reuses OSM data", async () => {
  rmSync(".sda-cache", { recursive: true, force: true });
  const fixture = readFileSync("test/geodata/files/osm-fixture.osm");
  let requests = 0;
  let requestBody = "";
  let acceptEncoding = "";
  let userAgent = "";
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0 },
    async (request) => {
      requests++;
      requestBody = await request.text();
      acceptEncoding = request.headers.get("accept-encoding") ?? "";
      userAgent = request.headers.get("user-agent") ?? "";
      return new Response(fixture, {
        headers: { "content-type": "application/xml" },
      });
    },
  );
  const endpoint =
    `http://${server.addr.hostname}:${server.addr.port}/interpreter`;

  try {
    const firstSdb = new SimpleDB({ dataTransport: "file" });
    const first = firstSdb.newTable("firstOsmTable");
    first.loadOSM(bbox, {
      filters: ["amenity", "school"],
      endpoint,
      timeout: 60,
    });
    assertEquals((await first.getTypes()).geom, "GEOMETRY('EPSG:4326')");
    await firstSdb.close();

    const cacheFiles = readdirSync(".sda-cache/osm");
    assertEquals(cacheFiles.some((file) => file.endsWith(".geoparquet")), true);
    assertEquals(
      Object.values(
        JSON.parse(readFileSync(".sda-cache/osm/sources.json", "utf-8")) as {
          [key: string]: unknown;
        },
      ).length,
      1,
    );
    assertEquals(existsSync(".sda-cache/sources.json"), false);

    const secondSdb = new SimpleDB({ dataTransport: "file" });
    const second = secondSdb.newTable("anotherOsmTable");
    second.loadOSM(bbox, {
      filters: ["amenity", "school"],
      endpoint,
      timeout: 60,
    });
    const rows = await secondSdb.customQuery(
      `SELECT kind, type, id, ST_AsText(geom) AS wkt
      FROM anotherOsmTable WHERE id IN (1, 10, 20) ORDER BY id`,
      { returnData: true },
    );
    assertEquals(rows, [
      { kind: "node", type: "node", id: 1, wkt: "POINT (-73.599 45.501)" },
      {
        kind: "area",
        type: "way",
        id: 10,
        wkt:
          "POLYGON ((-73.598 45.502, -73.596 45.502, -73.596 45.504, -73.598 45.504, -73.598 45.502))",
      },
      {
        kind: "area",
        type: "relation",
        id: 20,
        wkt:
          "MULTIPOLYGON (((-73.595 45.505, -73.593 45.505, -73.593 45.507, -73.595 45.507, -73.595 45.505)))",
      },
    ]);
    await secondSdb.close();

    assertEquals(requests, 1);
    assertStringIncludes(requestBody, "data=%5Bout%3Axml%5D");
    assertStringIncludes(
      new URLSearchParams(requestBody).get("data") ?? "",
      'nwr["amenity"="school"]',
    );
    assertStringIncludes(acceptEncoding, "gzip");
    assertStringIncludes(userAgent, "simple-data-analysis-core");
    assertEquals(existsSync(".sda-cache/tmp"), true);
    assertEquals(readdirSync(".sda-cache/tmp"), []);

    const thirdSdb = new SimpleDB({ dataTransport: "file" });
    const third = thirdSdb.newTable("differentOsmSource");
    third.loadOSM(bbox, {
      filters: ["amenity", "college"],
      endpoint,
      timeout: 60,
    });
    await third.run();
    await thirdSdb.close();
    assertEquals(requests, 2);
    assertEquals(
      Object.values(
        JSON.parse(readFileSync(".sda-cache/osm/sources.json", "utf-8")) as {
          [key: string]: unknown;
        },
      ).length,
      2,
    );
  } finally {
    await server.shutdown();
    rmSync(".sda-cache", { recursive: true, force: true });
  }
});

Deno.test("loadOSM with cache false always requests fresh data", async () => {
  rmSync(".sda-cache", { recursive: true, force: true });
  const fixture = readFileSync("test/geodata/files/osm-fixture.osm");
  let requests = 0;
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0 },
    () => {
      requests++;
      return new Response(fixture);
    },
  );
  const endpoint =
    `http://${server.addr.hostname}:${server.addr.port}/interpreter`;

  try {
    for (let index = 0; index < 2; index++) {
      const sdb = new SimpleDB({ dataTransport: "file" });
      const table = sdb.newTable(`uncachedOsm${index}`);
      table.loadOSM(bbox, {
        filters: ["amenity", "school"],
        endpoint,
        cache: false,
      });
      await table.run();
      await sdb.close();
    }
    assertEquals(requests, 2);
    assertEquals(existsSync(".sda-cache/osm/sources.json"), false);
    assertEquals(readdirSync(".sda-cache/tmp"), []);
  } finally {
    await server.shutdown();
    rmSync(".sda-cache", { recursive: true, force: true });
  }
});

Deno.test("loadOSM preserves a raw Overpass filter fragment", async () => {
  rmSync(".sda-cache", { recursive: true, force: true });
  const fixture = readFileSync("test/geodata/files/osm-fixture.osm");
  let requestBody = "";
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0 },
    async (request) => {
      requestBody = await request.text();
      return new Response(fixture);
    },
  );
  const endpoint =
    `http://${server.addr.hostname}:${server.addr.port}/interpreter`;

  try {
    const sdb = new SimpleDB({ dataTransport: "file" });
    const table = sdb.newTable("rawFilterOsm");
    table.loadOSM(bbox, {
      filters: `["amenity"~"school|college"]`,
      endpoint,
      cache: false,
    });
    await table.run();
    await sdb.close();

    assertStringIncludes(
      new URLSearchParams(requestBody).get("data") ?? "",
      'nwr["amenity"~"school|college"]',
    );
  } finally {
    await server.shutdown();
    rmSync(".sda-cache", { recursive: true, force: true });
  }
});

Deno.test("loadOSM does not cache failed or incomplete responses", async () => {
  rmSync(".sda-cache", { recursive: true, force: true });
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0 },
    () => new Response("<osm><node", { status: 200 }),
  );
  const endpoint =
    `http://${server.addr.hostname}:${server.addr.port}/interpreter`;

  try {
    const sdb = new SimpleDB({ dataTransport: "file" });
    const table = sdb.newTable();
    table.loadOSM(bbox, { filters: "[amenity]", endpoint });
    await assertRejects(() => table.run(), Error, "loadOSM()");
    await sdb.close();

    assertEquals(existsSync(".sda-cache/osm/sources.json"), false);
    assertEquals(readdirSync(".sda-cache/tmp"), []);
  } finally {
    await server.shutdown();
    rmSync(".sda-cache", { recursive: true, force: true });
  }
});

Deno.test("loadOSM rejects well-formed Overpass error responses", async () => {
  rmSync(".sda-cache", { recursive: true, force: true });
  const responses = [
    { tag: "remark", message: "runtime error: Query timed out" },
    { tag: "error", message: "internal server error" },
  ];
  let responseIndex = 0;
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0 },
    () => {
      const response = responses[responseIndex++];
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
        <osm version="0.6" generator="Overpass API">
          <${response.tag}>${response.message}</${response.tag}>
        </osm>`,
        { headers: { "content-type": "application/xml" } },
      );
    },
  );
  const endpoint =
    `http://${server.addr.hostname}:${server.addr.port}/interpreter`;

  try {
    for (const response of responses) {
      const sdb = new SimpleDB({ dataTransport: "file" });
      try {
        const table = sdb.newTable();
        table.loadOSM(bbox, {
          filters: `[${response.tag}]`,
          endpoint,
        });
        await assertRejects(() => table.run(), Error, response.message);
      } finally {
        await sdb.close();
      }
    }

    assertEquals(responseIndex, responses.length);
    assertEquals(existsSync(".sda-cache/osm/sources.json"), false);
    assertEquals(readdirSync(".sda-cache/tmp"), []);
  } finally {
    await server.shutdown();
    rmSync(".sda-cache", { recursive: true, force: true });
  }
});

Deno.test("loadOSM works with the public Overpass endpoint", async () => {
  const sdb = new SimpleDB({ dataTransport: "direct" });
  const table = sdb.newTable("publicOverpassSchools");

  try {
    table.loadOSM(
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

    const [summary] = await sdb.customQuery(
      `SELECT
        count(*)::INTEGER AS featureCount,
        count(*) FILTER (WHERE geom IS NULL)::INTEGER AS missingGeometryCount,
        count(*) FILTER (
          WHERE geom IS NOT NULL AND NOT ST_IsValid(geom)
        )::INTEGER AS invalidGeometryCount
      FROM publicOverpassSchools
      WHERE tags['amenity'] = 'school';`,
      { returnData: true },
    ) as {
      featureCount: number;
      missingGeometryCount: number;
      invalidGeometryCount: number;
    }[];

    assert(summary !== undefined);
    assert(
      summary.featureCount > 0,
      "The public Overpass endpoint returned no schools for the test bbox.",
    );
    assertEquals(summary.missingGeometryCount, 0);
    assertEquals(summary.invalidGeometryCount, 0);
  } finally {
    await sdb.close();
  }
});
