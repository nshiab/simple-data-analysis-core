import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should keep the highest-spending years per division after summarizing", async () => {
  const sdb = new SimpleDB();
  const data = await sdb
    .newTable()
    .loadArray([
      { division: "A", year: 2022, amount: 40 },
      { division: "A", year: 2022, amount: 60 },
      { division: "A", year: 2023, amount: 100 },
      { division: "A", year: 2024, amount: 80 },
      { division: "B", year: 2022, amount: 50 },
      { division: "B", year: 2024, amount: 70 },
    ])
    .summarize({ columns: "amount", by: ["division", "year"], stats: { spending: "sum" } })
    .keepValuesStat("spending", "max", { by: "division" })
    .sort({ division: "asc", year: "asc" })
    .getData();

  expect(data).toStrictEqual([
    { division: "A", year: 2022, spending: 100 },
    { division: "A", year: 2023, spending: 100 },
    { division: "B", year: 2024, spending: 70 },
  ]);
  await sdb.close();
});

test("should keep the minimum independently for each combination of grouping values", async () => {
  const sdb = new SimpleDB();
  const data = await sdb
    .newTable()
    .loadArray([
      { id: 1, "sales region": "East", product: "A", "unit price": 12 },
      { id: 2, "sales region": "East", product: "A", "unit price": 9 },
      { id: 3, "sales region": "East", product: "B", "unit price": 15 },
      { id: 4, "sales region": "West", product: "A", "unit price": 8 },
      { id: 5, "sales region": "West", product: "A", "unit price": null },
      { id: 6, "sales region": "West", product: "B", "unit price": null },
    ])
    .keepValuesStat("unit price", "min", { by: ["sales region", "product"] })
    .sort({ id: "asc" })
    .getData();

  expect(data).toStrictEqual([
    { id: 2, "sales region": "East", product: "A", "unit price": 9 },
    { id: 3, "sales region": "East", product: "B", "unit price": 15 },
    { id: 4, "sales region": "West", product: "A", "unit price": 8 },
  ]);
  await sdb.close();
});

test("should keep all rows tied at the minimum across the whole table when by is omitted", async () => {
  const sdb = new SimpleDB();
  const data = await sdb
    .newTable()
    .loadArray([
      { label: "first", amount: 3 },
      { label: "second", amount: 7 },
      { label: "third", amount: 3 },
      { label: "fourth", amount: null },
    ])
    .keepValuesStat("amount", "min")
    .sort({ label: "asc" })
    .getData();

  expect(data).toStrictEqual([
    { label: "first", amount: 3 },
    { label: "third", amount: 3 },
  ]);
  await sdb.close();
});
