import type SimpleDB from "../src/class/SimpleDB.ts";
import type updateColumnsWithJS from "../src/helpers/updateColumnsWithJS.ts";

// Optional baseline src/ URL or path relative to this file. Both versions use
// this repository's import map so the comparison isolates application changes.
const sources = [
  ...(Deno.args[0]
    ? [{ label: "before", url: new URL(Deno.args[0], import.meta.url) }]
    : []),
  { label: "after", url: new URL("../src/", import.meta.url) },
];
const implementations = await Promise.all(
  sources.map(async ({ label, url }) => ({
    label,
    DB: (await import(new URL("class/SimpleDB.ts", url).href))
      .default as typeof SimpleDB,
    generate:
      (await import(new URL("helpers/updateColumnsWithJS.ts", url).href))
        .default as typeof updateColumnsWithJS,
  })),
);
const rows = 100_000;
const observations = [];
let duckdbVersion;
for (const method of ["update", "generate", "normalize"]) {
  for (const wide of [false, true]) {
    const timings = new Map<string, number[]>(
      implementations.map(({ label }) => [label, []]),
    );
    // Two warm-ups and seven measured runs per variant; alternate order to
    // reduce drift. Each operation starts with a fresh database and fixture.
    for (let pass = -2; pass < 7; pass++) {
      const ordered = pass % 2 === 0
        ? implementations
        : [...implementations].reverse();
      for (const { label, DB, generate } of ordered) {
        const db = new DB();
        try {
          await db.start();
          await db.connection!.run(
            "SET threads=1; SET memory_limit='1GB'; SET TimeZone='UTC'",
          );
          const table = db.newTable("fixture");
          await db.customQuery(`CREATE TABLE fixture AS SELECT
            i::INTEGER AS id, i::DOUBLE AS value
            ${
            method === "normalize"
              ? ", [i+1, i+2, i+3, i+4]::DOUBLE[4] AS vector"
              : ""
          }
            ${wide ? ", repeat(md5(i::VARCHAR), 16) AS payload" : ""}
            FROM range(${rows}) t(i)`);
          const start = performance.now();
          if (method === "update") {
            await table.updateWithJS(
              (batch) =>
                batch.map((row) => ({
                  ...row,
                  value: Number(row.value) * 2,
                })),
              { batchSize: 1000 },
            ).run();
          } else if (method === "generate") {
            await generate(
              table,
              ["value"],
              ["doubled"],
              (batch) =>
                Promise.resolve(batch.map((row) => ({
                  doubled: Number(row.value) * 2,
                }))),
              { batchSize: 1000 },
            );
          } else {
            await table.normalizeVector("vector", "normalized", {
              normalization: "rowL2",
            }).run();
          }
          const elapsed = performance.now() - start;
          const expression = method === "normalize"
            ? "abs(list_inner_product(normalized, normalized)-1) < 1e-12"
            : `${method === "update" ? "value" : "doubled"} = id*2`;
          const validation = await db.connection!.runAndReadAll(
            `SELECT count(*), count(*) FILTER (WHERE ${expression}
              ${wide ? "AND payload = repeat(md5(id::VARCHAR),16)" : ""})
              FROM fixture`,
          );
          if (validation.getRows()[0].some((value) => value !== BigInt(rows))) {
            throw new Error(`Unexpected output: ${label}, ${method}, ${wide}`);
          }
          duckdbVersion ??=
            (await db.connection!.runAndReadAll("SELECT version()"))
              .getRows()[0][0];
          if (pass >= 0) timings.get(label)!.push(elapsed);
        } finally {
          await db.close();
        }
      }
    }
    for (const [implementation, samples] of timings) {
      const sorted = [...samples].sort((a, b) => a - b);
      const result = {
        implementation,
        method,
        wide,
        rows,
        samples,
        medianMs: sorted[Math.floor(sorted.length / 2)],
      };
      observations.push(result);
      console.error(JSON.stringify(result));
    }
  }
}
console.log(JSON.stringify(
  {
    runtime: Deno.version,
    platform: Deno.build,
    duckdbVersion,
    observations,
  },
  null,
  2,
));
