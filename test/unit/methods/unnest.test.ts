import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should unnest rows based on a specific column values", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/nestedData.csv");
  table.unnest("neighbourhoods", " / ");

  const data = await table.getData();

  assertEquals(data, [
    { city: "Montreal", neighbourhoods: "Old Montreal" },
    { city: "Montreal", neighbourhoods: "Chinatown" },
    { city: "Montreal", neighbourhoods: "Griffintown" },
    { city: "Toronto", neighbourhoods: "Kensington Market" },
    { city: "Toronto", neighbourhoods: "Liberty village" },
    { city: "Toronto", neighbourhoods: "Chinatown" },
    { city: "Vancouver", neighbourhoods: "Coal Harbour" },
    { city: "Vancouver", neighbourhoods: "West end" },
    { city: "Vancouver", neighbourhoods: "Yaletown" },
  ]);

  await sdb.done();
});

Deno.test("should bind an unnesting separator containing an apostrophe", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("boundUnnest");

  table.loadArray([{ group: "a", value: "rock'n'roll" }]);
  table.unnest("value", "'n'");

  assertEquals(await table.getData(), [
    { group: "a", value: "rock" },
    { group: "a", value: "roll" },
  ]);
  await sdb.done();
});
