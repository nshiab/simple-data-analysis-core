import { expect, test, vi } from "vite-plus/test";
import { SimpleDB } from "../../../src/index.ts";

test("loadHtmlTable loads explicitly closed rows and keeps cell values as strings", async () => {
  const sdb = new SimpleDB();
  try {
    const html = `
      <!-- <table></table> -->
      <script>const markup = "<table></table>";</script>
      <TABLE data-description="a > b">
        <caption>Results</caption>
        <thead><tr><th>City</th><th>Code</th></tr></thead>
        <tbody>
          <tr><td><a href="/city">Qu&#233;bec</a> &amp; L&#xE9;vis</td><td>001</td></tr>
          <tr><th scope="row">Toronto</th><td></td></tr>
        </tbody>
      </TABLE>`;
    const table = sdb.newTable().loadHtmlTable(html);
    expect(await table.getData()).toStrictEqual([
      { City: "Québec & Lévis", Code: "001" },
      { City: "Toronto", Code: "" },
    ]);
    expect(await table.getTypes()).toStrictEqual({ City: "VARCHAR", Code: "VARCHAR" });
  } finally {
    await sdb.close();
  }
});

test("loadHtmlTable fetches in chain order and selects the requested table", async () => {
  const url = "https://example.com/results";
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(`
      <table><tr><th>Name</th></tr><tr><td>First</td></tr></table>
      <table><tr><th>Name</th></tr><tr><td>Second</td></tr></table>`),
  );
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadHtmlTable(url, { index: 1 }).selectColumns("Name");
    expect(fetch).not.toHaveBeenCalled();
    expect(await table.getData()).toStrictEqual([{ Name: "Second" }]);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(url);
  } finally {
    fetch.mockRestore();
    await sdb.close();
  }
});

test.each([
  ["<p>No table</p>", /complete HTML table/],
  ["<table><tr><th>Name</th></tr><tr><td>First</tr></table>", /explicitly closed row cells/],
  ["<table><tr><th>Name</th></tr><tr><td>First</td></table>", /explicitly closed table rows/],
  ["<table><tr><th>Name</th></tr><tr><td>First</td><td>Extra</td></tr></table>", /same number/],
  ["<table><tr><th>Name</th><th>name</th></tr><tr><td>A</td><td>B</td></tr></table>", /unique/],
  ["<table><tr><th>Name</th></tr><tr><td colspan=2>First</td></tr></table>", /merged/],
  ["<table><tr><td><table><tr><td>A</td></tr></table></td></tr></table>", /nested tables/],
])("loadHtmlTable rejects unsupported markup in %s", async (html, error) => {
  const sdb = new SimpleDB();
  try {
    await expect(sdb.newTable().loadHtmlTable(html).getData()).rejects.toThrow(error);
  } finally {
    await sdb.close();
  }
});

test("loadHtmlTable reports HTTP failures", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 404 }));
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadHtmlTable("https://example.com/missing");
    await expect(table.getData()).rejects.toThrow(/Could not fetch the HTML page: 404/);
  } finally {
    fetch.mockRestore();
    await sdb.close();
  }
});
