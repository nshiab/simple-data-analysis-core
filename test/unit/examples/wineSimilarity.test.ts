import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("wine similarity example filters red wines and finds five named matches", async () => {
  const sdb = new SimpleDB();
  try {
    const wines = sdb.newTable("wines").loadData("test/data/files/wine.csv");
    const source = await wines.getData();
    assertEquals(source.length, 2000);
    assertEquals(await wines.getColumns(), [
      "fullName",
      "wineType",
      "regionName",
      "acidity",
      "intensity",
      "sweetness",
      "tannin",
      "vintageYear",
      "isNatural",
    ]);
    assertEquals(
      ["Red", "White", "Rosé", "Dessert", "Sparkling", "Fortified"].map((
        type,
      ) => source.filter((row) => row.wineType === type).length),
      [1026, 941, 21, 8, 3, 1],
    );
    assertEquals(source.filter((row) => row.tannin === null).length, 974);
    assertEquals(source.filter((row) => row.vintageYear === null).length, 1804);
    assert(source.every((row) => typeof row.isNatural === "boolean"));
    const before = await wines.filter("wineType === 'Red' && tannin !== null")
      .getData();
    assertEquals(before.length, 1026);
    assertEquals(
      before,
      source.filter((row) => row.wineType === "Red" && row.tannin !== null),
    );
    assertEquals(new Set(before.map((row) => row.fullName)).size, 1026);
    const features = ["acidity", "intensity", "sweetness", "tannin"];
    assert(
      before.every((row) =>
        features.every((feature) => Number.isFinite(row[feature]))
      ),
    );

    const reference = await wines.getFirstRow({
      conditions: "fullName === 'Louis Jadot Bourgogne Pinot Noir'",
    });
    assert(reference);
    assertEquals(features.map((column) => reference[column]), [
      3.9,
      2.49,
      1.34,
      2.27,
    ]);
    wines.similarityMahalanobis(
      ["acidity", "intensity", "sweetness", "tannin"],
      reference,
      "distance",
      { similarityScoreColumn: true },
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
    const measuredReference = measured.find((row) =>
      row.fullName === reference.fullName
    );
    assert(measuredReference);
    assertAlmostEquals(Number(measuredReference.distance), 0, 1e-10);
    assertAlmostEquals(Number(measuredReference.similarity), 1, 1e-10);
    assertAlmostEquals(
      measured.reduce((sum, row) => sum + Number(row.distance) ** 2, 0),
      5397.678390433373,
      1e-7,
    );

    const nearest = await wines
      .filter("fullName !== 'Louis Jadot Bourgogne Pinot Noir'")
      .sort({ distance: "asc", fullName: "asc" })
      .selectRows(5)
      .selectColumns(["fullName", "distance", "similarity"])
      .getData();
    // Independently calculated with NumPy 2.3.5; see the dataset notes.
    const expected = [
      {
        "fullName": "Moillard-Grivot Bourgogne Pinot Noir",
        "distance": 0.11872820160963446,
        "similarity": 0.9789344152751663,
      },
      {
        "fullName": "Michel Magnien Bourgogne Pinot Noir",
        "distance": 0.19147234858477688,
        "similarity": 0.9660276419006399,
      },
      {
        "fullName": "Louis Latour Bourgogne Pinot Noir",
        "distance": 0.19186390451860738,
        "similarity": 0.9659581693188373,
      },
      {
        "fullName": "Jean-Claude Boisset Pinot Noir Bourgogne 'Les Ursulines'",
        "distance": 0.208640146801332,
        "similarity": 0.9629816115307136,
      },
      {
        "fullName": "Joseph Drouhin Laforet Bourgogne Pinot Noir",
        "distance": 0.23985915823672418,
        "similarity": 0.9574425170148202,
      },
    ];
    assertEquals(
      nearest.map((row) => row.fullName),
      expected.map((row) => row.fullName),
    );
    for (const [index, row] of nearest.entries()) {
      assertAlmostEquals(Number(row.distance), expected[index].distance, 1e-9);
      assertAlmostEquals(
        Number(row.similarity),
        expected[index].similarity,
        1e-9,
      );
    }
    await wines.round(["distance", "similarity"], 3).log();
    assertEquals(await wines.getData(), [
      {
        "fullName": "Moillard-Grivot Bourgogne Pinot Noir",
        "distance": 0.119,
        "similarity": 0.979,
      },
      {
        "fullName": "Michel Magnien Bourgogne Pinot Noir",
        "distance": 0.191,
        "similarity": 0.966,
      },
      {
        "fullName": "Louis Latour Bourgogne Pinot Noir",
        "distance": 0.192,
        "similarity": 0.966,
      },
      {
        "fullName": "Jean-Claude Boisset Pinot Noir Bourgogne 'Les Ursulines'",
        "distance": 0.209,
        "similarity": 0.963,
      },
      {
        "fullName": "Joseph Drouhin Laforet Bourgogne Pinot Noir",
        "distance": 0.24,
        "similarity": 0.957,
      },
    ]);
  } finally {
    await sdb.close();
  }
});
