import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should fill empty cells for one column", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = await sdb
    .newTable()
    .loadArray([
      { first: "Nael" },
      { first: null },
      { first: null },
      { first: "Graeme" },
      { first: null },
      { first: null },
      { first: null },
      { first: null },
      { first: "Andrew" },
    ]);
  table.fill("first");
  const data = await table.getData();
  assertEquals(data, [
    { first: "Nael" },
    { first: "Nael" },
    { first: "Nael" },
    { first: "Graeme" },
    { first: "Graeme" },
    { first: "Graeme" },
    { first: "Graeme" },
    { first: "Graeme" },
    { first: "Andrew" },
  ]);
  await sdb.close();
});

Deno.test("should fill empty cells for multiple columns", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = await sdb.newTable().loadArray([
    { first: "Nael", job: "Senior producer" },
    { first: null, job: null },
    { first: null, job: "Senior producer" },
    { first: "Graeme", job: "Producer" },
    { first: null, job: null },
    { first: null, job: "Super producer" },
    { first: null, job: null },
    { first: null, job: null },
    { first: "Andrew", job: "Senior dev" },
  ]);
  table.fill(["first", "job"]);
  const data = await table.getData();
  assertEquals(data, [
    { first: "Nael", job: "Senior producer" },
    { first: "Nael", job: "Senior producer" },
    { first: "Nael", job: "Senior producer" },
    { first: "Graeme", job: "Producer" },
    { first: "Graeme", job: "Producer" },
    { first: "Graeme", job: "Super producer" },
    { first: "Graeme", job: "Super producer" },
    { first: "Graeme", job: "Super producer" },
    { first: "Andrew", job: "Senior dev" },
  ]);
  await sdb.close();
});

Deno.test("should fill empty cells by one grouping column", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = await sdb.newTable().loadArray([
    { group: "A", value: 1 },
    { group: "B", value: null },
    { group: "A", value: null },
    { group: "B", value: 2 },
    { group: "A", value: null },
  ]);
  table.fill("value", { by: "group" });
  const data = await table.getData();
  assertEquals(data, [
    { group: "A", value: 1 },
    { group: "B", value: null },
    { group: "A", value: 1 },
    { group: "B", value: 2 },
    { group: "A", value: 1 },
  ]);
  await sdb.close();
});

Deno.test("should fill empty cells by multiple columns", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = await sdb.newTable().loadArray([
    { group: "A", subgroup: "X", value: 10 },
    { group: "A", subgroup: "X", value: null },
    { group: "A", subgroup: "Y", value: null },
    { group: "B", subgroup: "X", value: 20 },
    { group: "B", subgroup: "X", value: null },
  ]);
  table.fill("value", { by: ["group", "subgroup"] });
  const data = await table.getData();
  assertEquals(data, [
    { group: "A", subgroup: "X", value: 10 },
    { group: "A", subgroup: "X", value: 10 },
    { group: "A", subgroup: "Y", value: null },
    { group: "B", subgroup: "X", value: 20 },
    { group: "B", subgroup: "X", value: 20 },
  ]);
  await sdb.close();
});

// Linear interpolation

Deno.test("should linearly interpolate NULL values between non-NULL values", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  table.loadArray([
    { val: 1 },
    { val: null },
    { val: 3 },
  ]);
  table.fill("val", { interpolate: true });
  const data = await table.getData();
  assertEquals(data, [{ val: 1 }, { val: 2 }, { val: 3 }]);
  await sdb.close();
});

Deno.test("should linearly interpolate NULL values independently within each category", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  table.loadArray([
    { group: "a", val: 1 },
    { group: "a", val: null },
    { group: "a", val: 3 },
    { group: "b", val: 10 },
    { group: "b", val: null },
    { group: "b", val: 30 },
  ]);
  table.fill("val", { by: "group", interpolate: true });
  const data = await table.getData();
  assertEquals(data, [
    { group: "a", val: 1 },
    { group: "a", val: 2 },
    { group: "a", val: 3 },
    { group: "b", val: 10 },
    { group: "b", val: 20 },
    { group: "b", val: 30 },
  ]);
  await sdb.close();
});

Deno.test("should linearly extrapolate NULL values at the end of the table", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  table.loadArray([
    { val: 2 },
    { val: 4 },
    { val: null },
  ]);
  table.fill("val", { interpolate: true });
  const data = await table.getData();
  assertEquals(data, [{ val: 2 }, { val: 4 }, { val: 6 }]);
  await sdb.close();
});

Deno.test("should interpolate proportionally to a non-equidistant x column", async () => {
  // x=[0,1,3], y=[0,null,6]: y at x=1 should be 2 (1/3 of the way), not 3 (row midpoint)
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  table.loadArray([
    { x: 0, y: 0 },
    { x: 1, y: null },
    { x: 3, y: 6 },
  ]);
  table.fill("y", { interpolate: true, interpolateBy: "x" });
  const data = await table.getData();
  assertEquals(data, [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 6 }]);
  await sdb.close();
});

Deno.test("should interpolate proportionally to a non-equidistant x column within by", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  table.loadArray([
    { group: "a", x: 0, y: 0 },
    { group: "a", x: 1, y: null },
    { group: "a", x: 3, y: 6 },
    { group: "b", x: 0, y: 10 },
    { group: "b", x: 2, y: null },
    { group: "b", x: 10, y: 50 },
  ]);
  table.fill("y", {
    interpolate: true,
    interpolateBy: "x",
    by: "group",
  });
  const data = await table.getData();
  // Row order is preserved (not reordered by group)
  assertEquals(data, [
    { group: "a", x: 0, y: 0 },
    { group: "a", x: 1, y: 2 },
    { group: "a", x: 3, y: 6 },
    { group: "b", x: 0, y: 10 },
    { group: "b", x: 2, y: 18 },
    { group: "b", x: 10, y: 50 },
  ]);
  await sdb.close();
});

Deno.test("should assume interpolate: true when only interpolateBy is set", async () => {
  // x=[0,1,3], y=[0,null,6]: y at x=1 should be 2 (1/3 of the way), not 3 (row midpoint)
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  table.loadArray([
    { x: 0, y: 0 },
    { x: 1, y: null },
    { x: 3, y: 6 },
  ]);
  table.fill("y", { interpolateBy: "x" });
  const data = await table.getData();
  assertEquals(data, [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 6 }]);
  await sdb.close();
});

Deno.test("should throw when interpolateBy is set and interpolate is false", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  table.loadArray([
    { x: 0, y: 0 },
    { x: 1, y: null },
    { x: 3, y: 6 },
  ]);
  let error: Error | undefined;
  try {
    table.fill("y", { interpolateBy: "x", interpolate: false });
  } catch (e) {
    error = e as Error;
  }
  assertEquals(
    error?.message,
    "interpolate cannot be false when interpolateBy is set.",
  );
  await table.run();
  await sdb.close();
});

// Row order preservation tests

Deno.test("should preserve row order after grouped fill() with interpolation", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  const input = [
    { id: 1, group: "a", val: 10 },
    { id: 2, group: "b", val: 100 },
    { id: 3, group: "a", val: null },
    { id: 4, group: "b", val: null },
    { id: 5, group: "a", val: 20 },
    { id: 6, group: "b", val: 200 },
  ];
  table.loadArray(input);
  table.fill("val", { by: "group", interpolate: true });
  const data = await table.getData();
  // Row order must match input order (by id)
  assertEquals(data.map((r) => r.id), [1, 2, 3, 4, 5, 6]);
  assertEquals(data, [
    { id: 1, group: "a", val: 10 },
    { id: 2, group: "b", val: 100 },
    { id: 3, group: "a", val: 15 },
    { id: 4, group: "b", val: 150 },
    { id: 5, group: "a", val: 20 },
    { id: 6, group: "b", val: 200 },
  ]);
  await sdb.close();
});

Deno.test("should preserve row order after simple fill() with no options", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  const input = [
    { id: 1, val: "A" },
    { id: 2, val: null },
    { id: 3, val: null },
    { id: 4, val: "B" },
    { id: 5, val: null },
  ];
  table.loadArray(input);
  table.fill("val");
  const data = await table.getData();
  // Row order must match input order (by id)
  assertEquals(data.map((r) => r.id), [1, 2, 3, 4, 5]);
  assertEquals(data, [
    { id: 1, val: "A" },
    { id: 2, val: "A" },
    { id: 3, val: "A" },
    { id: 4, val: "B" },
    { id: 5, val: "B" },
  ]);
  await sdb.close();
});

Deno.test("should preserve row order after grouped fill() with interpolateBy", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  const input = [
    { id: 1, group: "a", x: 0, y: 0 },
    { id: 2, group: "b", x: 0, y: 10 },
    { id: 3, group: "a", x: 1, y: null }, // 1/3 between 0 and 3 -> 2
    { id: 4, group: "b", x: 2, y: null }, // 2/10 between 0 and 10 -> 18
    { id: 5, group: "a", x: 3, y: 6 },
    { id: 6, group: "b", x: 10, y: 50 },
  ];
  table.loadArray(input);
  table.fill("y", {
    by: "group",
    interpolateBy: "x",
  });
  const data = await table.getData();
  // Row order must match input order (by id)
  assertEquals(data.map((r) => r.id), [1, 2, 3, 4, 5, 6]);
  assertEquals(data, [
    { id: 1, group: "a", x: 0, y: 0 },
    { id: 2, group: "b", x: 0, y: 10 },
    { id: 3, group: "a", x: 1, y: 2 },
    { id: 4, group: "b", x: 2, y: 18 },
    { id: 5, group: "a", x: 3, y: 6 },
    { id: 6, group: "b", x: 10, y: 50 },
  ]);
  await sdb.close();
});
