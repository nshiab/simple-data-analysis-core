import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import { normalizeStatCanPid } from "../../../src/methods/loadStatCanData.ts";
import writeZip from "../../../src/helpers/writeZip.ts";

const cacheDirectory = ".sda-cache";
const pid = "17100005";

Deno.test("loadStatCanData normalizes PIDs and validates options at call time", async () => {
  assertEquals(normalizeStatCanPid("17-10-0005-01"), pid);
  assertEquals(normalizeStatCanPid("1710000501"), pid);
  assertEquals(normalizeStatCanPid(pid), pid);

  const sdb = new SimpleDB();
  const table = sdb.newTable("statCanValidation");
  assertThrows(
    () => table.loadStatCanData("17-10-005"),
    Error,
    "8 or 10 digits",
  );
  assertThrows(
    () => table.loadStatCanData(pid, { ttl: -1 }),
    Error,
    "non-negative",
  );
  assertThrows(
    () => table.loadStatCanData(pid, { ttl: Number.POSITIVE_INFINITY }),
    Error,
    "finite",
  );
  await sdb.close();
});

Deno.test("loadStatCanData is chainable and caches without expiring by default", async () => {
  rmSync(cacheDirectory, { recursive: true, force: true });
  const fixtureDirectory = await Deno.makeTempDir({
    prefix: "sda-statcan-fixture-",
  });
  const csv = `${fixtureDirectory}/${pid}.csv`;
  const zip = `${fixtureDirectory}/${pid}.zip`;
  writeFileSync(
    csv,
    "REF_DATE,GEO,VALUE\n2023,Canada,39\n2024,Canada,42\n",
  );
  await writeZip(zip, [{ file: csv, name: `${pid}.csv` }]);
  const archive = new Uint8Array(readFileSync(zip));
  const requests: string[] = [];
  const restoreFetch = mockStatCanFetch(archive, requests);

  try {
    const firstSdb = new SimpleDB({
      dataTransport: "file",
      cacheVerbose: true,
    });
    const first = firstSdb.newTable("statCanFirst");
    const returned = first
      .loadStatCanData("17-10-0005-01")
      .filter("VALUE > 40");
    assertEquals(returned, first);
    assertEquals(first.pendingOps.map((operation) => operation.method), [
      "loadStatCanData()",
      "filter()",
    ]);
    const missLogs = await captureConsoleLogs(async () => {
      assertEquals(await first.getData(), [
        { REF_DATE: 2024, GEO: "Canada", VALUE: 42 },
      ]);
    });
    assertStringIncludes(missLogs, "loadStatCanData() cache for statCanFirst");
    assertStringIncludes(missLogs, "Cache miss.");
    assertStringIncludes(missLogs, "Computations done in");
    assertStringIncludes(missLogs, "Wrote in cache in");
    await firstSdb.close();

    assertEquals(requests.length, 2);
    assertStringIncludes(requests[0], `/${pid}/en`);
    assertEquals(existsSync(".sda-cache/statcan/sources.json"), true);
    assertEquals(
      readdirSync(".sda-cache/statcan").some((file) =>
        file.endsWith(".parquet")
      ),
      true,
    );
    assertEquals(readdirSync(".sda-cache/tmp"), []);

    const secondSdb = new SimpleDB({
      dataTransport: "file",
      cacheVerbose: true,
    });
    const second = secondSdb.newTable("statCanSecond");
    second.loadStatCanData(pid, { ttl: 60 });
    const hitLogs = await captureConsoleLogs(async () => {
      assertEquals(await second.getData(), [
        { REF_DATE: 2023, GEO: "Canada", VALUE: 39 },
        { REF_DATE: 2024, GEO: "Canada", VALUE: 42 },
      ]);
    });
    assertStringIncludes(hitLogs, "loadStatCanData() cache for statCanSecond");
    assertStringIncludes(hitLogs, "Cache hit.");
    assertStringIncludes(hitLogs, "TTL of 1 min, 0 sec, 0 ms has not expired.");
    assertStringIncludes(hitLogs, "Data loaded in");
    assertStringIncludes(hitLogs, "Running computations previously took");
    assertStringIncludes(hitLogs, "You saved");
    await secondSdb.close();
    assertEquals(requests.length, 2);

    const sourcesPath = ".sda-cache/statcan/sources.json";
    const sources = JSON.parse(readFileSync(sourcesPath, "utf-8")) as {
      [key: string]: { creation: number };
    };
    for (const source of Object.values(sources)) {
      source.creation = 0;
    }
    writeFileSync(sourcesPath, JSON.stringify(sources));

    const thirdSdb = new SimpleDB({ dataTransport: "file" });
    const third = thirdSdb.newTable("statCanThird");
    third.loadStatCanData(pid);
    await third.run();
    await thirdSdb.close();
    assertEquals(requests.length, 2);

    const fourthSdb = new SimpleDB({
      dataTransport: "file",
      cacheVerbose: true,
    });
    const fourth = fourthSdb.newTable("statCanFourth");
    fourth.loadStatCanData(pid, { ttl: 0 });
    const staleLogs = await captureConsoleLogs(() => fourth.run());
    assertStringIncludes(staleLogs, "Cache entry is stale.");
    assertStringIncludes(staleLogs, "TTL of 0 ms has expired.");
    assertStringIncludes(staleLogs, "refreshing the cache entry");
    await fourthSdb.close();
    assertEquals(requests.length, 4);
  } finally {
    restoreFetch();
    rmSync(cacheDirectory, { recursive: true, force: true });
    await Deno.remove(fixtureDirectory, { recursive: true });
  }
});

Deno.test("loadStatCanData with cache false always requests fresh data", async () => {
  rmSync(cacheDirectory, { recursive: true, force: true });
  const fixtureDirectory = await Deno.makeTempDir({
    prefix: "sda-statcan-uncached-",
  });
  const csv = `${fixtureDirectory}/${pid}.csv`;
  const zip = `${fixtureDirectory}/${pid}.zip`;
  writeFileSync(csv, "REF_DATE,GEO,VALUE\n2024,Canada,42\n");
  await writeZip(zip, [{ file: csv, name: `${pid}.csv` }]);
  const archive = new Uint8Array(readFileSync(zip));
  const requests: string[] = [];
  const restoreFetch = mockStatCanFetch(archive, requests);

  try {
    let uncachedLogs = "";
    for (let index = 0; index < 2; index++) {
      const sdb = new SimpleDB({
        dataTransport: "file",
        cacheVerbose: index === 0,
      });
      const table = sdb.newTable(`statCanUncached${index}`);
      table.loadStatCanData(pid, {
        cache: false,
        lang: index === 0 ? "en" : "fr",
      });
      const run = async () => {
        assertEquals(await table.getRowCount(), 1);
      };
      if (index === 0) {
        uncachedLogs = await captureConsoleLogs(run);
      } else {
        await run();
      }
      await sdb.close();
    }
    assertStringIncludes(uncachedLogs, "Cache disabled.");
    assertStringIncludes(uncachedLogs, "without storing a cache entry");
    assertEquals(requests.length, 4);
    assertStringIncludes(requests[0], `/${pid}/en`);
    assertStringIncludes(requests[2], `/${pid}/fr`);
    assertEquals(existsSync(".sda-cache/statcan/sources.json"), false);
    assertEquals(readdirSync(".sda-cache/tmp"), []);
  } finally {
    restoreFetch();
    rmSync(cacheDirectory, { recursive: true, force: true });
    await Deno.remove(fixtureDirectory, { recursive: true });
  }
});

Deno.test("loadStatCanData reports unsuccessful WDS responses", async () => {
  rmSync(cacheDirectory, { recursive: true, force: true });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      Response.json({ status: "FAILED", object: null }),
    )) as typeof fetch;

  const sdb = new SimpleDB({ dataTransport: "file" });
  try {
    const table = sdb.newTable("statCanFailure");
    table.loadStatCanData(pid, { cache: false });
    const error = await assertRejects(
      () => table.run(),
      Error,
      `did not return a CSV download URL for PID ${pid}`,
    );
    assertStringIncludes(error.message, "SDA method: loadStatCanData()");
  } finally {
    globalThis.fetch = originalFetch;
    await sdb.close();
    rmSync(cacheDirectory, { recursive: true, force: true });
  }
});

Deno.test("loadStatCanData loads live English Statistics Canada data", async () => {
  rmSync(cacheDirectory, { recursive: true, force: true });
  const sdb = new SimpleDB({ dataTransport: "file" });
  const populationColumn =
    "Population and dwelling counts (11): Population, 2021 [1]";

  try {
    const table = sdb
      .newTable("statCanLiveEnglish")
      .loadStatCanData("9810000101", { cache: false })
      .selectColumns([
        "REF_DATE",
        "GEO",
        "DGUID",
        "Coordinate",
        populationColumn,
      ]);

    assertEquals(await table.getRowCount(), 14);
    assertEquals(await table.getFirstRow(), {
      REF_DATE: 2021,
      GEO: "Canada",
      DGUID: "2021A000011124",
      Coordinate: 1,
      [populationColumn]: 36991981,
    });
  } finally {
    await sdb.close();
    rmSync(cacheDirectory, { recursive: true, force: true });
  }
});

Deno.test("loadStatCanData loads live French Statistics Canada data", async () => {
  rmSync(cacheDirectory, { recursive: true, force: true });
  const sdb = new SimpleDB({ dataTransport: "file" });
  const populationColumn =
    "Chiffres de population et des logements (11): Population, 2021 [1]";

  try {
    const table = sdb
      .newTable("statCanLiveFrench")
      .loadStatCanData("98-10-0001-01", { lang: "fr", cache: false })
      .selectColumns([
        "PÉRIODE DE RÉFÉRENCE",
        "GÉO",
        "DGUID",
        "Coordonnée",
        populationColumn,
      ]);

    assertEquals(await table.getRowCount(), 14);
    assertEquals(await table.getFirstRow(), {
      "PÉRIODE DE RÉFÉRENCE": 2021,
      "GÉO": "Canada",
      DGUID: "2021A000011124",
      "Coordonnée": 1,
      [populationColumn]: 36991981,
    });
  } finally {
    await sdb.close();
    rmSync(cacheDirectory, { recursive: true, force: true });
  }
});

function mockStatCanFetch(
  archive: Uint8Array,
  requests: string[],
): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push(url);
    if (url.includes("getFullTableDownloadCSV")) {
      return Promise.resolve(Response.json({
        status: "SUCCESS",
        object: `https://download.test/${pid}.zip`,
      }));
    }
    if (url === `https://download.test/${pid}.zip`) {
      return Promise.resolve(new Response(archive.slice()));
    }
    return Promise.resolve(new Response("Not found", { status: 404 }));
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

async function captureConsoleLogs(
  run: () => Promise<unknown>,
): Promise<string> {
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
