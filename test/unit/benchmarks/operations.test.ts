import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import {
  assertRowsEquivalent,
  workloads,
} from "../../../benchmarks/operations/workloads.ts";
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
    }))
  )
);

Deno.test("operation tables report duration spread, process memory, and batch sizes", () => {
  const report = renderResults(observations);
  assertStringIncludes(report, "15.00 ± 5.00 ms");
  assertStringIncludes(report, "150.0 MiB");
  assertStringIncludes(report, "#### JavaScript geometry updates");
  assertStringIncludes(report, "Polygons: geometry update");
  const geometry = report.slice(
    report.indexOf("#### JavaScript geometry updates"),
  );
  assertEquals(
    geometry.split("\n").filter((line) => /^\| (Points|Polygons):/.test(line))
      .length,
    8,
  );
  assertEquals(geometry.includes("| Points: attribute update"), false);
  assertEquals(geometry.includes("| Polygons: attribute update"), false);
  assertStringIncludes(report, "10,003 | 1000 | Core");
  assertStringIncludes(report, "10,003 | 10000 | DuckDB");
  assertThrows(() => renderResults(observations.slice(1)));
  assertThrows(() =>
    renderResults(
      observations.map((o) => ({ ...o, milliseconds: NaN })),
    )
  );
});

Deno.test("operation tables and original tables update independently", () => {
  const original =
    "before\n<!-- benchmark-results:start -->\nlegacy\n<!-- benchmark-results:end -->\nmiddle\n";
  const readme = `${original}${resultsStart}\nold\n${resultsEnd}\nafter`;
  const updated = replaceResults(readme, "new");
  assertEquals(
    updated,
    `${original}${resultsStart}\n\nnew\n\n${resultsEnd}\nafter`,
  );
  assertStringIncludes(
    replaceBenchmarkResults(updated, "updated legacy"),
    `${resultsStart}\n\nnew\n\n${resultsEnd}\nafter`,
  );
  for (
    const invalid of [
      "no markers",
      `${resultsEnd}${resultsStart}`,
      `${readme}${resultsStart}`,
      `${readme}${resultsEnd}`,
    ]
  ) {
    assertThrows(() => replaceResults(invalid, "new"));
  }
});

Deno.test("operation validation rejects values, missing columns, and duplicate count differences", () => {
  assertRowsEquivalent([{ a: 1, b: null }, { a: 2, b: "x" }], [
    { b: "x", a: 2 },
    { b: null, a: 1 },
  ]);
  for (
    const rows of [[{ a: 1 }], [{ a: "1", b: null }], [{ a: 1, b: "" }], [{
      a: 1,
      b: null,
    }, { a: 1, b: null }]]
  ) {
    assertThrows(() => assertRowsEquivalent([{ a: 1, b: null }], rows));
  }
});

Deno.test("both implementations validate complete outputs after warm-up and measurement", async () => {
  for (const workload of workloads) {
    for (const implementation of ["core", "duckdb"]) {
      const output = await new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "-A",
          "benchmarks/operations/worker.ts",
          implementation,
          workload.name,
          "shape" in workload
            ? String(workload.batchSize ? workload.batchSize + 3 : 103)
            : "10003",
        ],
        stdout: "piped",
        stderr: "piped",
      }).output();
      assertEquals(
        output.success,
        true,
        new TextDecoder().decode(output.stderr),
      );
      const sample = JSON.parse(new TextDecoder().decode(output.stdout)) as {
        milliseconds: number;
        duckdbVersion: string;
      };
      assertEquals(
        Number.isFinite(sample.milliseconds) && sample.milliseconds > 0,
        true,
      );
      assertEquals(typeof sample.duckdbVersion, "string");
    }
  }
});

Deno.test("operation report writes formatted tables without changing surrounding content", async () => {
  const path = await Deno.makeTempFile({ suffix: ".md" });
  try {
    await Deno.writeTextFile(
      path,
      `before\n${resultsStart}\nold\n${resultsEnd}\nafter`,
    );
    await writeReport(path, observations);
    const content = await Deno.readTextFile(path);
    assertEquals(content.startsWith(`before\n${resultsStart}\n`), true);
    assertEquals(content.endsWith(`${resultsEnd}\nafter`), true);
    assertStringIncludes(content, "15.00 ± 5.00 ms");
  } finally {
    await Deno.remove(path);
  }
});
