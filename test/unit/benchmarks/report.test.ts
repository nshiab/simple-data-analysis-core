import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import type { Aggregate } from "../../../benchmarks/helpers.ts";
import {
  benchmarkResultsEnd,
  benchmarkResultsStart,
  renderBenchmarkResults,
  replaceBenchmarkResults,
  replaceMeasuredBenchmarkResults,
} from "../../../benchmarks/report.ts";

const aggregates: Aggregate[] = [
  {
    benchmark: "tabular",
    implementation: "duckdb",
    version: "@duckdb/node-api@1.5.5-r.4/duckdb@v1.5.5/deno@2.9.6",
    meanSeconds: 1,
    stdDevSeconds: 0.1,
    meanPeakMemoryMB: 100,
  },
  {
    benchmark: "tabular",
    implementation: "local",
    version: "2.0.0-rc.17/deno@2.9.6",
    meanSeconds: 2,
    stdDevSeconds: 0.2,
    meanPeakMemoryMB: 200,
  },
];

Deno.test("benchmark report renders tables and percentage differences", () => {
  const markdown = renderBenchmarkResults(aggregates);
  assertStringIncludes(markdown, "### Tabular workload");
  assertStringIncludes(
    markdown,
    "| @duckdb/node-api 1.5.5-r.4; DuckDB v1.5.5 | Deno 2.9.6",
  );
  assertStringIncludes(
    markdown,
    "| SDA-core 2.0.0-rc.17",
  );
  assertStringIncludes(markdown, "Duration difference");
  assertStringIncludes(markdown, "Memory difference");
  assertEquals(
    markdown.indexOf("@duckdb/node-api") <
      markdown.indexOf("SDA-core 2.0.0-rc.17"),
    true,
  );
  assertStringIncludes(
    markdown,
    "| 2.00 ± 0.20 s |            baseline |           200 MB |          baseline |",
  );
  assertStringIncludes(markdown, "|              -50.0% |           100 MB |");
});

Deno.test("benchmark report replaces only the generated README section", () => {
  const readme =
    `before\n${benchmarkResultsStart}\nold\n${benchmarkResultsEnd}\nafter\n`;
  assertEquals(
    replaceBenchmarkResults(readme, "new"),
    `before\n${benchmarkResultsStart}\n\nnew\n\n${benchmarkResultsEnd}\nafter\n`,
  );
  assertThrows(
    () => replaceBenchmarkResults("no markers", "new"),
    Error,
    "markers are missing",
  );
});

Deno.test("benchmark report keeps workload descriptions before their tables", () => {
  const markdown = renderBenchmarkResults(aggregates);
  const spatialStart = markdown.indexOf("### Spatial workload");
  const tabular = markdown.slice(0, spatialStart);
  const spatial = markdown.slice(spatialStart);
  for (
    const [section, files] of [
      [tabular, ["ahccd.csv"]],
      [spatial, ["arbres-publics.csv", "quartierreferencehabitation.geojson"]],
    ] as const
  ) {
    for (const file of files) {
      assertStringIncludes(section, file);
      assertEquals(section.indexOf(file) < section.indexOf("| Library"), true);
    }
    assertStringIncludes(section, "benchmarks/data/");
  }
  assertEquals(tabular.includes("SDA-core is the baseline"), false);
  assertEquals(spatial.includes("SDA-core is the baseline"), false);
  assertStringIncludes(tabular, "22,051,025 temperature records");
  assertStringIncludes(tabular, "1.77 GB");
  assertStringIncludes(spatial, "335,024 Montreal public trees");
  assertStringIncludes(spatial, "135.5 MB");
  assertStringIncludes(spatial, "91\nneighbourhood boundaries");
  assertStringIncludes(spatial, "1.14 MB");
  assertStringIncludes(tabular, "average temperatures by station and decade");
  assertStringIncludes(spatial, "trees per neighbourhood");
});

Deno.test("partial benchmark reports preserve the unmeasured workload", () => {
  const readme = `before
${benchmarkResultsStart}

### Tabular workload

old tabular

### Spatial workload

old spatial

${benchmarkResultsEnd}
after
`;

  const tabular = replaceMeasuredBenchmarkResults(readme, aggregates);
  assertStringIncludes(tabular, "SDA-core 2.0.0-rc.17");
  assertStringIncludes(tabular, "ahccd.csv");
  assertStringIncludes(tabular, "old spatial");
  assertEquals(tabular.includes("old tabular"), false);

  const spatial = replaceMeasuredBenchmarkResults(readme, [{
    ...aggregates[1],
    benchmark: "spatial",
  }]);
  assertStringIncludes(spatial, "old tabular");
  assertStringIncludes(spatial, "SDA-core 2.0.0-rc.17");
  assertStringIncludes(spatial, "arbres-publics.csv");
  assertEquals(spatial.includes("old spatial"), false);
});
