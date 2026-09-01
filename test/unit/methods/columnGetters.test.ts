import { assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("column getters throw when a missing column matches the table name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([
    { value: 1 },
    { value: 2 },
  ]);

  const getters: { name: string; call: () => Promise<unknown> }[] = [
    { name: "getData()", call: () => table.getData({ columns: "data" }) },
    { name: "getValues()", call: () => table.getValues("data") },
    { name: "getMin()", call: () => table.getMin("data") },
    { name: "getMax()", call: () => table.getMax("data") },
    { name: "getMean()", call: () => table.getMean("data") },
    { name: "getMedian()", call: () => table.getMedian("data") },
    { name: "getSum()", call: () => table.getSum("data") },
    { name: "getSkew()", call: () => table.getSkew("data") },
    { name: "getStdDev()", call: () => table.getStdDev("data") },
    { name: "getVariance()", call: () => table.getVariance("data") },
    {
      name: "getQuantile()",
      call: () => table.getQuantile("data", 0.5),
    },
    {
      name: "getCharacterCount()",
      call: () => table.getCharacterCount("data"),
    },
    { name: "getUniques()", call: () => table.getUniques("data") },
  ];

  for (const getter of getters) {
    await assertRejects(
      getter.call,
      Error,
      "does not have a column named",
      getter.name,
    );
  }

  await sdb.close();
});
