import { test, expect } from "vite-plus/test";
import { assertThrows } from "../../helpers/assertions.ts";

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

test("benchmark report renders tables and percentage differences", () => {
  const markdown = renderBenchmarkResults(aggregates);
  expect(markdown).toContain("### Tabular workload");
  expect(markdown).toContain(
    "**Tabular versions:** @duckdb/node-api 1.5.5-r.4; DuckDB v1.5.5 (Deno 2.9.6)",
  );
  expect(markdown).toContain("SDA-core 2.0.0-rc.17 (Deno 2.9.6)");
  const table = markdown.slice(markdown.indexOf("| Library"));
  expect(table.includes("Runtime")).toStrictEqual(false);
  expect(table.includes("2.9.6")).toStrictEqual(false);
  expect(table.includes("2.0.0-rc.17")).toStrictEqual(false);
  expect(table).toContain("| DuckDB");
  expect(table).toContain("| SDA-core");
  expect(markdown).toContain("Duration difference");
  expect(markdown).toContain("Memory difference");
  expect(
    markdown.indexOf("@duckdb/node-api") < markdown.indexOf("SDA-core 2.0.0-rc.17"),
  ).toStrictEqual(true);
  expect(markdown).toContain(
    "| 2.00 ± 0.20 s |            baseline |           200 MB |          baseline |",
  );
  expect(markdown).toContain("|              -50.0% |           100 MB |");
});

test("partial benchmark runs retain the other workload's version details", () => {
  const spatial: Aggregate = {
    ...aggregates[1],
    benchmark: "spatial",
    version: "1.9.0/deno@2.8.0",
  };
  const readme = `${benchmarkResultsStart}\n${renderBenchmarkResults([
    ...aggregates,
    spatial,
  ])}\n${benchmarkResultsEnd}`;
  const updated = replaceMeasuredBenchmarkResults(readme, [
    {
      ...aggregates[1],
      version: "2.0.5/deno@2.9.6",
    },
  ]);
  expect(updated).toContain("**Tabular versions:** SDA-core 2.0.5 (Deno 2.9.6).");
  expect(updated).toContain("**Spatial versions:** SDA-core 1.9.0 (Deno 2.8.0).");
  expect(updated.includes("2.0.0-rc.17")).toStrictEqual(false);
  expect(updated.match(/\*\*Spatial versions:/g)?.length).toStrictEqual(1);
  expect(
    updated
      .slice(updated.indexOf("### Spatial workload"), updated.indexOf(benchmarkResultsEnd))
      .trim(),
  ).toStrictEqual(
    readme
      .slice(readme.indexOf("### Spatial workload"), readme.indexOf(benchmarkResultsEnd))
      .trim(),
  );
});

test("benchmark report replaces only the generated README section", () => {
  const readme = `before\n${benchmarkResultsStart}\nold\n${benchmarkResultsEnd}\nafter\n`;
  expect(replaceBenchmarkResults(readme, "new")).toStrictEqual(
    `before\n${benchmarkResultsStart}\n\nnew\n\n${benchmarkResultsEnd}\nafter\n`,
  );
  assertThrows(() => replaceBenchmarkResults("no markers", "new"), Error, "markers are missing");
});

test("benchmark report keeps workload descriptions before their tables", () => {
  const markdown = renderBenchmarkResults(aggregates);
  const spatialStart = markdown.indexOf("### Spatial workload");
  const tabular = markdown.slice(0, spatialStart);
  const spatial = markdown.slice(spatialStart);
  for (const [section, files] of [
    [tabular, ["ahccd.csv"]],
    [spatial, ["arbres-publics.csv", "quartierreferencehabitation.geojson"]],
  ] as const) {
    for (const file of files) {
      expect(section).toContain(file);
      expect(section.indexOf(file) < section.indexOf("| Library")).toStrictEqual(true);
    }
    expect(section).toContain("benchmarks/data/");
  }
  expect(tabular.includes("SDA-core is the baseline")).toStrictEqual(false);
  expect(spatial.includes("SDA-core is the baseline")).toStrictEqual(false);
  expect(tabular).toContain("22,051,025 temperature records");
  expect(tabular).toContain("1.77 GB");
  expect(spatial).toContain("335,024 Montreal public trees");
  expect(spatial).toContain("135.5 MB");
  expect(spatial).toContain("91\nneighbourhood boundaries");
  expect(spatial).toContain("1.14 MB");
  expect(tabular).toContain("average temperatures by station and decade");
  expect(spatial).toContain("trees per neighbourhood");
});

test("partial benchmark reports preserve the unmeasured workload", () => {
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
  expect(tabular).toContain("SDA-core 2.0.0-rc.17");
  expect(tabular).toContain("ahccd.csv");
  expect(tabular).toContain("old spatial");
  expect(tabular.includes("old tabular")).toStrictEqual(false);

  const spatial = replaceMeasuredBenchmarkResults(readme, [
    {
      ...aggregates[1],
      benchmark: "spatial",
    },
  ]);
  expect(spatial).toContain("old tabular");
  expect(spatial).toContain("SDA-core 2.0.0-rc.17");
  expect(spatial).toContain("arbres-publics.csv");
  expect(spatial.includes("old spatial")).toStrictEqual(false);
});
