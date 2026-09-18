import { assertThrows } from "@std/assert";
import prepareUmapLayoutOptions from "../../../src/helpers/prepareUmapLayoutOptions.ts";

Deno.test("UMAP rejects invalid layout options before optimization", () => {
  for (
    const options of [
      { epochs: 0 },
      { epochs: 1.1 },
      { seed: 2 ** 32 },
      { seed: -1 },
      { seed: 0.5 },
      { learningRate: Infinity },
      { learningRate: 0 },
      { negativeSamples: 0 },
      { negativeSamples: 1.5 },
      { minDistance: NaN },
      { minDistance: -0.1 },
      { minDistance: 1.1 },
    ]
  ) {
    assertThrows(() => prepareUmapLayoutOptions(options));
  }
});
