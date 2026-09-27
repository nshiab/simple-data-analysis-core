import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

const fixture = "test/data/graphs/villagePayments.csv";

Deno.test("village economy example calculates weighted activity and preserves payments", async () => {
  const sdb = new SimpleDB();
  try {
    const payments = sdb.newTable("payments").loadData(fixture);
    const before = await payments.getData();
    const activity = payments.degree("payer", "payee", {
      weight: "amount",
      outputTable: "activity",
    });

    // Hand-checked receipts and payments for all 12 fictional businesses.
    assertEquals(await activity.sort({ node: "asc" }).getData(), [
      { node: "Bakery", incoming: 1200, outgoing: 2400, total: 3600 },
      { node: "Builder", incoming: 1700, outgoing: 3100, total: 4800 },
      { node: "Cafe", incoming: 0, outgoing: 1600, total: 1600 },
      { node: "Carpenter", incoming: 1550, outgoing: 1750, total: 3300 },
      { node: "Dairy", incoming: 2400, outgoing: 500, total: 2900 },
      { node: "Farm", incoming: 4500, outgoing: 1000, total: 5500 },
      { node: "Grocer", incoming: 300, outgoing: 3000, total: 3300 },
      { node: "Inn", incoming: 250, outgoing: 2500, total: 2750 },
      { node: "Laundry", incoming: 800, outgoing: 350, total: 1150 },
      { node: "Mill", incoming: 1800, outgoing: 2400, total: 4200 },
      { node: "Repair Shop", incoming: 1550, outgoing: 450, total: 2000 },
      { node: "Sawmill", incoming: 3500, outgoing: 500, total: 4000 },
    ]);
    assertEquals(await payments.getData(), before);
    assertEquals(before.length, 19);
    assertEquals(await payments.getSum("amount"), 19550);
    assertEquals(await activity.getSum("incoming"), 19550);
    assertEquals(await activity.getSum("outgoing"), 19550);
    assertEquals(await activity.getSum("total"), 39100);
  } finally {
    await sdb.close();
  }
});

Deno.test("village economy has one bridge between food and service businesses", async () => {
  const sdb = new SimpleDB();
  try {
    const payments = sdb.newTable("payments").loadData(fixture);
    const connected = payments.connectedComponents("payer", "payee", {
      outputTable: "connected",
    });
    assertEquals(await connected.getRowCount(), 12);
    assertEquals((await connected.getUniques("componentId")).length, 1);

    const separated = await payments
      .removeRows(`payer === 'Farm' && payee === 'Repair Shop'`)
      .connectedComponents("payer", "payee")
      .getData();
    const groups = Array.from(
      Map.groupBy(separated, (row) => row.componentId).values(),
      (rows) => rows.map((row) => String(row.node)).sort(),
    ).sort((a, b) => a[0].localeCompare(b[0]));
    assertEquals(groups, [
      ["Bakery", "Cafe", "Dairy", "Farm", "Grocer", "Mill"],
      ["Builder", "Carpenter", "Inn", "Laundry", "Repair Shop", "Sawmill"],
    ]);
  } finally {
    await sdb.close();
  }
});
