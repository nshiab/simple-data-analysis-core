import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("wine similarity example finds five matches and scores from a sample ID", async () => {
  const sdb = new SimpleDB();
  try {
    const wines = sdb.newTable("wines").loadData("test/data/files/wine.csv");
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

    const reference = await wines.getFirstRow({
      conditions: "sampleId === 100",
    });
    assert(reference);
    const features = Object.keys(reference).filter(
      (column) => column !== "sampleId" && column !== "cultivar",
    );
    assertEquals(features.length, 13);
    wines.similarityMahalanobis(
      features,
      features.map((column) => Number(reference[column])),
      "distance",
      { similarityScoreColumn: "similarity" },
    );
    const measured = await wines.getData();
    assertEquals(
      measured.map(({ distance: _distance, similarity: _similarity, ...row }) =>
        row
      ),
      before,
    );
    for (const row of measured) {
      assert(typeof row.distance === "number" && Number.isFinite(row.distance));
      assert(row.distance >= 0);
      assert(
        typeof row.similarity === "number" && Number.isFinite(row.similarity),
      );
      assert(row.similarity >= 0 && row.similarity <= 1);
    }
    assertAlmostEquals(Number(measured[99].distance), 0, 1e-10);
    assertAlmostEquals(Number(measured[99].similarity), 1, 1e-10);
    assertAlmostEquals(
      measured.reduce((sum, row) => sum + Number(row.distance) ** 2, 0),
      6192.535079801026,
      1e-7,
    );

    const nearest = await wines
      .filter("sampleId !== 100")
      .sort({ distance: "asc", sampleId: "asc" })
      .selectRows(5)
      .selectColumns(["sampleId", "distance", "similarity"])
      .getData();
    // Independently calculated with NumPy 2.3.5; see the dataset notes.
    assertEquals(nearest.map((row) => row.sampleId), [80, 98, 94, 116, 66]);
    const distances = [
      3.5621154572677396,
      3.7131964229726457,
      3.8560930990272975,
      3.9829390442689765,
      4.055784068281499,
    ];
    const similarities = [
      0.6079712571203002,
      0.5913440360858155,
      0.5756175373388148,
      0.5616575023402229,
      0.5536405406411278,
    ];
    for (const [index, row] of nearest.entries()) {
      assertAlmostEquals(Number(row.distance), distances[index], 1e-9);
      assertAlmostEquals(Number(row.similarity), similarities[index], 1e-9);
    }
    await wines.round(["distance", "similarity"], 3).log();
    assertEquals(await wines.getData(), [
      { sampleId: 80, distance: 3.562, similarity: 0.608 },
      { sampleId: 98, distance: 3.713, similarity: 0.591 },
      { sampleId: 94, distance: 3.856, similarity: 0.576 },
      { sampleId: 116, distance: 3.983, similarity: 0.562 },
      { sampleId: 66, distance: 4.056, similarity: 0.554 },
    ]);
  } finally {
    await sdb.close();
  }
});
