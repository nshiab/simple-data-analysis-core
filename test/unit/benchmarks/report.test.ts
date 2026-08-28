import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import type { Aggregate } from "../../../benchmarks/helpers.ts";
import {
  benchmarkResultsEnd,
  benchmarkResultsStart,
  renderBenchmarkResults,
  replaceBenchmarkResults,
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
