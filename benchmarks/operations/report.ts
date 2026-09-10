import { type WorkloadName, workloads } from "./workloads.ts";

export type Observation = {
  workload: WorkloadName;
  implementation: "core" | "duckdb";
  rows: number;
  iteration: number;
  milliseconds: number;
  peakMemoryMB: number;
};
export type Environment = {
  date: string;
  cpu: string;
  os: string;
  arch: string;
  deno: string;
  core: string;
  duckdb: string;
  nodeAPI: string;
};
export const resultsStart = "<!-- benchmark-operations:start -->";
export const resultsEnd = "<!-- benchmark-operations:end -->";

export function replaceResults(readme: string, results: string): string {
  const start = readme.indexOf(resultsStart);
  const end = readme.indexOf(resultsEnd);
  if (
    start < 0 || end < start || readme.indexOf(resultsStart, start + 1) >= 0 ||
    readme.indexOf(resultsEnd, end + 1) >= 0
  ) {
    throw new Error(
      "README must have exactly one ordered pair of operation benchmark markers.",
    );
  }
  return `${readme.slice(0, start + resultsStart.length)}\n\n${results}\n\n${
    readme.slice(end)
  }`;
}

export function renderResults(
  observations: Observation[],
): string {
  const mean = (values: number[]) =>
    values.reduce((a, b) => a + b, 0) / values.length;
  function table(section: "join" | "transfer" | "geometry") {
    const lines = [
      "| Operation | Rows | Batch size | Implementation | Mean duration ± SD | Mean peak process memory |",
      "| --- | ---: | ---: | --- | ---: | ---: |",
    ];
    for (
      const workload of workloads.filter((w) =>
        section === "join"
          ? w.name === "join-aggregate"
          : section === "geometry"
          ? "shape" in w && w.edit
          : w.name !== "join-aggregate" && !("shape" in w)
      )
    ) {
      for (const implementation of ["core", "duckdb"] as const) {
        const group = observations.filter((o) =>
          o.workload === workload.name && o.implementation === implementation
        );
        if (
          !group.length ||
          group.some((o) =>
            o.rows !== group[0].rows || !Number.isFinite(o.milliseconds) ||
            o.milliseconds < 0 || !Number.isFinite(o.peakMemoryMB) ||
            o.peakMemoryMB <= 0
          )
        ) {
          throw new Error(
            `Missing or invalid observations for ${workload.name}/${implementation}`,
          );
        }
        const duration = mean(group.map((o) => o.milliseconds));
        const sd = Math.sqrt(
          mean(group.map((o) => (o.milliseconds - duration) ** 2)),
        );
        lines.push(
          `| ${workload.label} | ${group[0].rows.toLocaleString("en-US")} | ${
            workload.batchSize || "—"
          } | ${implementation === "core" ? "Core" : "DuckDB"} | ${
            duration.toFixed(2)
          } ± ${sd.toFixed(2)} ms | ${
            mean(group.map((o) => o.peakMemoryMB)).toFixed(1)
          } MiB |`,
        );
      }
    }
    return lines.join("\n");
  }
  const counts = new Set(
    workloads.flatMap((w) =>
      ["core", "duckdb"].map((i) =>
        observations.filter((o) =>
          o.workload === w.name && o.implementation === i
        ).length
      )
    ),
  );
  if (counts.size !== 1 || counts.has(0)) {
    throw new Error("All comparisons need the same number of samples.");
  }
  return `#### Join followed by aggregation

${table("join")}

#### JavaScript data transfer

\`loadArray()\` measures JavaScript → DuckDB; \`getData()\` measures DuckDB →
JavaScript. \`updateWithJS()\` measures the round trip with a simple numeric
increment, including Core's staging and table replacement.

${table("transfer")}

#### JavaScript geometry updates

Points have one position per geometry; polygons have one ring with 1,001
positions. Both implementations transfer GeoJSON through JavaScript and stage
writes. These updates add a label and shift every longitude by 0.01 degrees.
A batch size of — means all input rows at once. Attribute-only updates are
also measured and retained in the raw results; their similar timings are
omitted here to keep the table concise.

${table("geometry")}`;
}

export async function writeReport(
  readmePath: string | URL,
  observations: Observation[],
): Promise<void> {
  // Format only the generated fragment, preserving all other README content.
  const formatter = new Deno.Command(Deno.execPath(), {
    args: ["fmt", "--ext=md", "-"],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const writer = formatter.stdin.getWriter();
  await writer.write(
    new TextEncoder().encode(renderResults(observations)),
  );
  await writer.close();
  const formatted = await formatter.output();
  if (!formatted.success) {
    throw new Error(new TextDecoder().decode(formatted.stderr));
  }
  await Deno.writeTextFile(
    readmePath,
    replaceResults(
      await Deno.readTextFile(readmePath),
      new TextDecoder().decode(formatted.stdout).trim(),
    ),
  );
}
