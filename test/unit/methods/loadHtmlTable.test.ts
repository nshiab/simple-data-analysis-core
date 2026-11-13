import { afterEach, expect, test, vi } from "vite-plus/test";
import { SimpleDB } from "../../../src/index.ts";

const url = "https://example.com/results";
const expensesUrl = "https://www.ourcommons.ca/proactivedisclosure/en/members/2024/1";

afterEach(() => vi.restoreAllMocks());

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
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(html));
    const table = sdb.newTable().loadHtmlTable(url);
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
    await sdb.close();
  }
});

test.each(['ID = "Results"', "id='Results'", "id=Res&#117;lts"])(
  "loadHtmlTable selects a table with %s",
  async (attribute) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(`
        <table id=results data-id=Results title="contains id='Results'">
          <tr><th>Name</th></tr><tr><td>First</td></tr>
        </table>
        <table ${attribute}><tr><th>Name</th></tr><tr><td>Second</td></tr></table>`),
    );
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable().loadHtmlTable(url, { id: "Results", columns: ["city"] });
      expect(await table.getData()).toStrictEqual([{ city: "Second" }]);
    } finally {
      await sdb.close();
    }
  },
);

test("loadHtmlTable reports a missing element ID", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("<table id=other><tr><th>Name</th></tr><tr><td>First</td></tr></table>"),
  );
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadHtmlTable(url, { id: "results" });
    await expect(table.getData()).rejects.toThrow(/with ID "results"/);
  } finally {
    await sdb.close();
  }
});

test.each([
  { options: { id: "results" }, name: "First" },
  { options: { id: "results", index: 1 }, name: "Second" },
])(
  "loadHtmlTable selects $name within the element with the requested ID",
  async ({ options, name }) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(`
      <table><tr><th>Name</th></tr><tr><td>Outside</td></tr></table>
      <section id=results>
        <section><table><tr><th>Name</th></tr><tr><td>First</td></tr></table></section>
        <table><tr><th>Name</th></tr><tr><td>Second</td></tr></table>
      </section>
      <table><tr><th>Name</th></tr><tr><td>After</td></tr></table>`),
    );
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable().loadHtmlTable(url, options);
      expect(await table.getData()).toStrictEqual([{ Name: name }]);
    } finally {
      await sdb.close();
    }
  },
);

test.each(["section", "table"])(
  "loadHtmlTable keeps the index within the selected %s",
  async (tag) => {
    const tableHtml = "<table><tr><th>Name</th></tr><tr><td>First</td></tr></table>";
    const scope =
      tag === "table"
        ? tableHtml.replace("<table>", "<table id=results>")
        : `<section id=results>${tableHtml}</section>`;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(`${scope}${tableHtml}`));
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable().loadHtmlTable(url, { id: "results", index: 1 });
      await expect(table.getData()).rejects.toThrow(/at index 1.*with ID "results"/);
    } finally {
      await sdb.close();
    }
  },
);

test.each([
  ["<tr><th>City</th><th>Code</th></tr><tr><td>Toronto</td><td>001</td></tr>"],
  ["<tr><th scope='row'>Toronto</th><td>001</td></tr>"],
])("loadHtmlTable uses custom column names for %s", async (rows) => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(`<table>${rows}</table>`));
  const sdb = new SimpleDB();
  try {
    const columns = ["name", "id"];
    const table = sdb.newTable().loadHtmlTable(url, { columns });
    columns[0] = "changed";
    expect(await table.getData()).toStrictEqual([{ name: "Toronto", id: "001" }]);
  } finally {
    await sdb.close();
  }
});

test("loadHtmlTable rejects a headerless table without custom column names", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("<table><tr><td>A</td></tr></table>"),
  );
  const sdb = new SimpleDB();
  try {
    await expect(sdb.newTable().loadHtmlTable(url).getData()).rejects.toThrow(/options\.columns/);
  } finally {
    await sdb.close();
  }
});

test.each([
  { columns: ["onlyOne"], error: /same number of cells/ },
  { columns: ["name", "Name"], error: /unique/ },
])("loadHtmlTable rejects invalid custom column names $columns", async ({ columns, error }) => {
  const html = "<table><tr><td>Toronto</td><td>001</td></tr></table>";
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(html));
  const sdb = new SimpleDB();
  try {
    await expect(sdb.newTable().loadHtmlTable(url, { columns }).getData()).rejects.toThrow(error);
  } finally {
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
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(html));
  const sdb = new SimpleDB();
  try {
    await expect(sdb.newTable().loadHtmlTable(url).getData()).rejects.toThrow(error);
  } finally {
    await sdb.close();
  }
});

test.each(["<table></table>", "./results.html", "https://", "file:///results.html"])(
  "loadHtmlTable rejects invalid input %s before fetching",
  async (input) => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const sdb = new SimpleDB();
    try {
      expect(() => sdb.newTable().loadHtmlTable(input)).toThrow(/requires an HTTP or HTTPS URL/);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      await sdb.close();
    }
  },
);

test("loadHtmlTable reports HTTP failures", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadHtmlTable("https://example.com/missing");
    await expect(table.getData()).rejects.toThrow(/Could not fetch the HTML page: 404/);
  } finally {
    await sdb.close();
  }
});

test.skipIf(process.env.CI === "true")(
  "loadHtmlTable loads the House of Commons expenses table by ID",
  async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable().loadHtmlTable(expensesUrl, { id: "data-table" });
      expect(await table.getColumns()).toStrictEqual([
        "Name",
        "Constituency",
        "Caucus",
        "Salaries",
        "Travel",
        "Hospitality",
        "Contracts",
      ]);
      expect(await table.getData()).toContainEqual(
        expect.objectContaining({ Constituency: "Edmonton Manning", Salaries: "$53,042.45" }),
      );
    } finally {
      await sdb.close();
    }
  },
);

test.skipIf(process.env.CI === "true")(
  "loadHtmlTable loads the live expenses table by index with custom column names",
  async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable().loadHtmlTable(expensesUrl, {
        index: 0,
        columns: ["name", "riding", "caucus", "salaries", "travel", "hospitality", "contracts"],
      });
      const firstRow = await table.getFirstRow();
      expect(firstRow).toMatchObject({ riding: "Edmonton Manning", travel: "$17,000.89" });
    } finally {
      await sdb.close();
    }
  },
);
