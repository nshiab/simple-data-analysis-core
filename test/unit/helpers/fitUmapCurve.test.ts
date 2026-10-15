import { test } from "vite-plus/test";
import { assertAlmostEquals, assertThrows } from "../../helpers/assertions.ts";
import { readFile as nodeReadFile } from "node:fs/promises";

import fitUmapCurve from "../../../src/helpers/fitUmapCurve.ts";

// umap-learn 0.5.9.post2 find_ab_params uses SciPy with spread fixed at one.
const fixture = JSON.parse(
  await nodeReadFile(new URL("../../data/umap/layout-reference.json", import.meta.url), "utf8"),
) as { curves: { minDistance: number; parameters: number[] }[] };

for (const { minDistance, parameters } of fixture.curves) {
  test(`UMAP curve agrees with scipy at minDistance=${minDistance}`, () => {
    const actual = fitUmapCurve(minDistance);
    actual.forEach((value, i) => assertAlmostEquals(value, parameters[i], 2e-5));
  });
}
test("UMAP curve rejects invalid minimum distances", () => {
  for (const value of [-1, 1.1, NaN, Infinity]) {
    assertThrows(() => fitUmapCurve(value));
  }
});
