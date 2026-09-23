import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("wine similarity example matches independent distances and nearest wines", async () => {
  const sdb = new SimpleDB();
  try {
    const wines = sdb.newTable("wines").loadData("test/data/files/wine.csv");
    const features = [
      "alcohol",
      "malicAcid",
      "ash",
      "ashAlkalinity",
      "magnesium",
      "totalPhenols",
      "flavanoids",
      "nonflavanoidPhenols",
      "proanthocyanins",
      "colorIntensity",
      "hue",
      "od280Od315",
      "proline",
    ];
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
    wines.mahalanobis(
      features,
      features.map((column) => Number(reference[column])),
      "distance",
    );
    const measured = await wines.getData();
    assertEquals(measured.map(({ distance: _, ...row }) => row), before);
    for (const row of measured) {
      assert(typeof row.distance === "number" && Number.isFinite(row.distance));
      assert(row.distance >= 0);
    }
    assertAlmostEquals(Number(measured[99].distance), 0, 1e-10);
    assertAlmostEquals(
      measured.reduce((sum, row) => sum + Number(row.distance) ** 2, 0),
      6192.535079801026,
      1e-7,
    );

    const nearest = await wines
      .filter("sampleId !== 100")
      .sort({ distance: "asc", sampleId: "asc" })
      .selectRows(10)
      .getData();
    // NumPy 2.3.5 reference calculation is documented next to the source data.
    assertEquals(nearest.map((row) => row.sampleId), [
      80,
      98,
      94,
      116,
      66,
      87,
      33,
      91,
      49,
      84,
    ]);
    assertEquals(nearest.map((row) => row.cultivar), [
      2,
      2,
      2,
      2,
      2,
      2,
      1,
      2,
      1,
      2,
    ]);
    const expected = [
      3.5621154572677396,
      3.7131964229726457,
      3.8560930990272975,
      3.9829390442689765,
      4.055784068281499,
      4.164616028424752,
      4.300883971149527,
      4.349038814137899,
      4.46531653462971,
      4.489720567066118,
    ];
    for (const [index, row] of nearest.entries()) {
      assertAlmostEquals(Number(row.distance), expected[index], 1e-9);
    }
  } finally {
    await sdb.close();
  }
});
