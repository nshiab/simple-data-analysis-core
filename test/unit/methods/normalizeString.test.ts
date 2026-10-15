import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";
import normalizeString from "../../../src/methods/normalizeString.ts";

test("normalizeString - convert to lowercase and strip punctuation", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("test");
  table.loadArray([{ text: "Hello, World!" }, { text: "HELLO" }, { text: "hElLo" }]);

  normalizeString(table, "text", "normalized");

  const results = (await table.getData()) as {
    text: string;
    normalized: string;
  }[];

  expect(results[0].normalized).toStrictEqual("hello world");
  expect(results[1].normalized).toStrictEqual("hello");
  expect(results[2].normalized).toStrictEqual("hello");
});

test("normalizeString - strip punctuation keeps alphanumeric", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("test");
  table.loadArray([{ text: "100%" }, { text: "email@example.com" }, { text: "multi-word-string" }]);

  normalizeString(table, "text", "normalized");

  const results = (await table.getData()) as {
    text: string;
    normalized: string;
  }[];

  expect(results[0].normalized).toStrictEqual("100");
  expect(results[1].normalized).toStrictEqual("emailexamplecom");
  expect(results[2].normalized).toStrictEqual("multiwordstring");
});

test("normalizeString - keep punctuation option", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("test");
  table.loadArray([{ text: "Hello, World!" }, { text: "100%" }]);

  normalizeString(table, "text", "normalized", {
    stripPunctuation: false,
  });

  const results = (await table.getData()) as {
    text: string;
    normalized: string;
  }[];

  expect(results[0].normalized).toStrictEqual("hello, world!");
  expect(results[1].normalized).toStrictEqual("100%");
});

test("normalizeString - keep punctuation for emails and URLs", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("test");
  table.loadArray([{ text: "User@Example.com" }, { text: "https://example.com/path" }]);

  normalizeString(table, "text", "normalized", {
    stripPunctuation: false,
  });

  const results = (await table.getData()) as {
    text: string;
    normalized: string;
  }[];

  expect(results[0].normalized).toStrictEqual("user@example.com");
  expect(results[1].normalized).toStrictEqual("https://example.com/path");
});

test("normalizeString - trim and normalize whitespace", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("test");
  table.loadArray([
    { text: "  hello  " },
    { text: "\tworld\n" },
    { text: "  multiple   spaces  " },
  ]);

  normalizeString(table, "text", "normalized");

  const results = (await table.getData()) as {
    text: string;
    normalized: string;
  }[];

  expect(results[0].normalized).toStrictEqual("hello");
  expect(results[1].normalized).toStrictEqual("world");
  expect(results[2].normalized).toStrictEqual("multiple spaces");
});

test("normalizeString - NULL handling", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("test");
  table.loadArray([{ text: "Hello" }, { text: null }, { text: "World" }]);

  normalizeString(table, "text", "normalized");

  const results = (await table.getData()) as {
    text: string | null;
    normalized: string | null;
  }[];

  expect(results[0].normalized).toStrictEqual("hello");
  expect(results[1].normalized).toStrictEqual(null);
  expect(results[2].normalized).toStrictEqual("world");
});

test("normalizeString - empty and whitespace-only strings", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("test");
  table.loadArray([{ text: "" }, { text: "   " }]);

  normalizeString(table, "text", "normalized");

  const results = (await table.getData()) as {
    text: string;
    normalized: string;
  }[];

  expect(results[0].normalized).toStrictEqual("");
  expect(results[1].normalized).toStrictEqual("");
});

test("normalizeString - special patterns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("test");
  table.loadArray([{ text: "email@example.com" }, { text: "price: $99.99" }]);

  normalizeString(table, "text", "normalized");

  const results = (await table.getData()) as {
    text: string;
    normalized: string;
  }[];

  expect(results[0].normalized).toStrictEqual("emailexamplecom");
  expect(results[1].normalized).toStrictEqual("price 9999");
});

test("normalizeString - mixed string types", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("test");
  table.loadArray([{ text: "Hello" }, { text: "123" }, { text: "World" }, { text: null }]);

  normalizeString(table, "text", "normalized");

  const results = (await table.getData()) as {
    text: string | null;
    normalized: string | null;
  }[];

  expect(results[0].normalized).toStrictEqual("hello");
  expect(results[1].normalized).toStrictEqual("123");
  expect(results[2].normalized).toStrictEqual("world");
  expect(results[3].normalized).toStrictEqual(null);
});

test("normalizeString - long strings", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("test");
  const longText = "Hello " + "World ".repeat(10000) + "!";
  table.loadArray([{ text: longText }]);

  normalizeString(table, "text", "normalized");

  const results = (await table.getData()) as {
    text: string;
    normalized: string;
  }[];

  expect(results[0].normalized.charAt(0)).toStrictEqual("h");
  expect(typeof results[0].normalized).toStrictEqual("string");
});

test("normalizeString - matches journalism-format core tests", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("test");
  table.loadArray([
    { text: "Évènement!", expected: "evenement" },
    { text: "Café?", expected: "cafe" },
    { text: "Niño!", expected: "nino" },
    { text: " façade... ", expected: "facade" },
    { text: "ÖBB (Austria)", expected: "obb austria" },
    { text: "", expected: "" },
    { text: "Hello, World!", expected: "hello world" },
    { text: "Wait... what?", expected: "wait what" },
    { text: "100%", expected: "100" },
    { text: "email@example.com", expected: "emailexamplecom" },
    { text: "multi-word-string", expected: "multiwordstring" },
    { text: "underscore_test", expected: "underscoretest" },
  ]);

  normalizeString(table, "text", "normalized");

  const results = (await table.getData()) as {
    text: string;
    normalized: string;
    expected: string;
  }[];

  for (const row of results) {
    expect(row.normalized).toStrictEqual(row.expected);
  }
});

test("normalizeString - complex accented strings", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("test");
  table.loadArray([
    {
      text: "ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿ",
      expected: "aaaaaaceeeeiiiinooooouuuuyaaaaaaceeeeiiiinooooouuuuyy",
    },
  ]);

  normalizeString(table, "text", "normalized");

  const results = (await table.getData()) as {
    text: string;
    normalized: string;
    expected: string;
  }[];

  expect(results[0].normalized).toStrictEqual(results[0].expected);
});
