import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "vite-plus/test";
import { assertThrows } from "../../helpers/assertions.ts";
import {
  writeFile as nodeWriteFile,
  readFile as nodeReadFile,
  rm as nodeRm,
} from "node:fs/promises";

import { assertRowsEquivalent, workloads } from "../../../benchmarks/operations/workloads.ts";
import {
  type Observation,
  renderResults,
  replaceResults,
  resultsEnd,
  resultsStart,
  writeReport,
} from "../../../benchmarks/operations/report.ts";
import { replaceBenchmarkResults } from "../../../benchmarks/report.ts";

const observations: Observation[] = workloads.flatMap((workload) =>
  (["core", "duckdb"] as const).flatMap((implementation) =>
    [1, 2].map((iteration) => ({
      workload: workload.name,
      implementation,
      rows: 10003,
      iteration,
      milliseconds: iteration * 10,
      peakMemoryMB: iteration * 100,
    })),
  ),
);

test("operation tables report duration spread, process memory, and batch sizes", () => {
  const report = renderResults(observations);
  expect(report).toContain("15.00 ± 5.00 ms");
  expect(report).toContain("150.0 MiB");
  expect(report).toContain("#### JavaScript geometry updates");
  expect(report).toContain("Polygons: geometry update");
  const geometry = report.slice(report.indexOf("#### JavaScript geometry updates"));
  expect(
    geometry.split("\n").filter((line) => /^\| (Points|Polygons):/.test(line)).length,
  ).toStrictEqual(8);
  expect(geometry.includes("| Points: attribute update")).toStrictEqual(false);
  expect(geometry.includes("| Polygons: attribute update")).toStrictEqual(false);
  expect(report).toContain("10,003 | 1000 | Core");
  expect(report).toContain("10,003 | 10000 | DuckDB");
  assertThrows(() => renderResults(observations.slice(1)));
  assertThrows(() => renderResults(observations.map((o) => ({ ...o, milliseconds: NaN }))));
});

test("operation tables and original tables update independently", () => {
  const original =
    "before\n<!-- benchmark-results:start -->\nlegacy\n<!-- benchmark-results:end -->\nmiddle\n";
  const readme = `${original}${resultsStart}\nold\n${resultsEnd}\nafter`;
  const updated = replaceResults(readme, "new");
  expect(updated).toStrictEqual(`${original}${resultsStart}\n\nnew\n\n${resultsEnd}\nafter`);
  expect(replaceBenchmarkResults(updated, "updated legacy")).toContain(
    `${resultsStart}\n\nnew\n\n${resultsEnd}\nafter`,
  );
  for (const invalid of [
    "no markers",
    `${resultsEnd}${resultsStart}`,
    `${readme}${resultsStart}`,
    `${readme}${resultsEnd}`,
  ]) {
    assertThrows(() => replaceResults(invalid, "new"));
  }
});

test("operation validation rejects values, missing columns, and duplicate count differences", () => {
  assertRowsEquivalent(
    [
      { a: 1, b: null },
      { a: 2, b: "x" },
    ],
    [
      { b: "x", a: 2 },
      { b: null, a: 1 },
    ],
  );
  for (const rows of [
    [{ a: 1 }],
    [{ a: "1", b: null }],
    [{ a: 1, b: "" }],
    [
      {
        a: 1,
        b: null,
      },
      { a: 1, b: null },
    ],
  ]) {
    assertThrows(() => assertRowsEquivalent([{ a: 1, b: null }], rows));
  }
});

test("both implementations validate complete outputs after warm-up and measurement", async () => {
  for (const workload of workloads) {
    for (const implementation of ["core", "duckdb"]) {
      const output = await promisify(execFile)(process.execPath, [
        "benchmarks/operations/worker.ts",
        implementation,
        workload.name,
        "shape" in workload ? String(workload.batchSize ? workload.batchSize + 3 : 103) : "10003",
      ]);
      const sample = JSON.parse(output.stdout) as {
        milliseconds: number;
        duckdbVersion: string;
      };
      expect(Number.isFinite(sample.milliseconds) && sample.milliseconds > 0).toStrictEqual(true);
      expect(typeof sample.duckdbVersion).toStrictEqual("string");
    }
  }
});

test("operation report writes formatted tables without changing surrounding content", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "sda-fixture-"));
  const path = join(temporaryDirectory, "fixture.md");
  try {
    await nodeWriteFile(path, `before\n${resultsStart}\nold\n${resultsEnd}\nafter`);
    await writeReport(path, observations);
    const content = await nodeReadFile(path, "utf8");
    expect(content.startsWith(`before\n${resultsStart}\n`)).toStrictEqual(true);
    expect(content.endsWith(`${resultsEnd}\nafter`)).toStrictEqual(true);
    expect(content).toContain("15.00 ± 5.00 ms");
  } finally {
    await nodeRm(temporaryDirectory, { recursive: true });
  }
});
