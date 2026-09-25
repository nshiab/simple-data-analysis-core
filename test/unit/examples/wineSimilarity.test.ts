import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("wine similarity example ranks a custom profile and projects all wines", async () => {
  const sdb = new SimpleDB();
  try {
    const wines = sdb.newTable("wines").loadData("test/data/files/wine.csv");
    // An illustrative custom profile, separate from the source dataset.
    const ourWine = {
      alcohol: 12.5,
      malicAcid: 1.8,
      ash: 2.2,
      ashAlkalinity: 20,
      magnesium: 95,
      totalPhenols: 2.3,
      flavanoids: 2.1,
      nonflavanoidPhenols: 0.35,
      proanthocyanins: 1.6,
      colorIntensity: 3.5,
      hue: 1.05,
      od280Od315: 2.8,
      proline: 600,
    };
    const features = Object.keys(ourWine);
    const before = await wines.getData();
    assertEquals(before.length, 178);
    assertEquals(
      before.map((row) => row.sampleId),
      Array.from({ length: 178 }, (_, i) => i + 1),
    );
    assertEquals(
      [1, 2, 3].map((cultivar) =>
        before.filter((row) => row.cultivar === cultivar).length
      ),
      [59, 71, 48],
    );

    wines.mahalanobis(features, Object.values(ourWine), "distance");
    const measured = await wines.getData();
    assertEquals(measured.map(({ distance: _, ...row }) => row), before);
    for (const row of measured) {
      assert(typeof row.distance === "number" && Number.isFinite(row.distance));
      assert(row.distance >= 0);
    }
    assertAlmostEquals(
      measured.reduce((sum, row) => sum + Number(row.distance) ** 2, 0),
      2485.3126627919487,
      1e-7,
    );

    const nearest = await wines
      .sort({ distance: "asc", sampleId: "asc" })
      .getTop(10);
    // NumPy 2.3.5 reference calculation is documented next to the source data.
    assertEquals(nearest.map((row) => row.sampleId), [
      82,
      36,
      118,
      39,
      45,
      98,
      86,
      102,
      117,
      104,
    ]);
    const expected = [
      1.9307887295225996,
      1.9381735088850447,
      2.2654848344840275,
      2.2688650913222634,
      2.2995573105831633,
      2.3512125713043495,
      2.387295769590808,
      2.451120918996673,
      2.451660532283562,
      2.4709677878890117,
    ];
    for (const [index, row] of nearest.entries()) {
      assertAlmostEquals(Number(row.distance), expected[index], 1e-9);
    }

    const custom = { sampleId: 0, cultivar: null, ...ourWine, distance: 0 };
    const projected = await wines
      .insertRows([custom])
      .sort({ sampleId: "asc" })
      .rowToVector(features, "features", { type: "double" })
      .normalizeVector("features", "scaledFeatures")
      .umap("scaledFeatures", { seed: 42 })
      .getData();
    assertEquals(projected.length, 179);
    assertEquals(
      projected.map(({
        features: _features,
        scaledFeatures: _scaled,
        umapX: _x,
        umapY: _y,
        ...row
      }) => row),
      [custom, ...measured],
    );
    for (const row of projected) {
      assert(Number.isFinite(row.umapX) && Number.isFinite(row.umapY));
      const scaled = row.scaledFeatures as number[];
      assertEquals(scaled.length, 13);
      assert(
        scaled.every((value) =>
          Number.isFinite(value) && value >= 0 && value <= 1
        ),
      );
    }
  } finally {
    await sdb.close();
  }
});
