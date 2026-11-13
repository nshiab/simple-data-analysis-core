import SDAError from "../class/SDAError.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import queueOp from "../helpers/queueOp.ts";
import { executePreparedArray } from "./loadArray.ts";

const attributes = String.raw`(?:[^"'<>]|"[^"]*"|'[^']*')*`;
const sectionTags = new RegExp(String.raw`<\/?(?:thead|tbody|tfoot)(?=[\s>])${attributes}>`, "gi");
const nestedStructure = /<\/?(?:table|thead|tbody|tfoot|tr|th|td)(?=[\s/>])/i;
const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

export default function loadHtmlTable(
  table: SimpleTable,
  url: string,
  { index = 0, columns }: { index?: number; columns?: string[] } = {},
): void {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new Error("loadHtmlTable() requires a nonnegative integer table index.");
  }

  const pageUrl = URL.parse(url);
  if (pageUrl === null || (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:")) {
    throw new Error("loadHtmlTable() requires an HTTP or HTTPS URL.");
  }
  const method = "loadHtmlTable()";
  const parameters = { url: pageUrl.href, index, columns: columns?.slice() };
  queueOp(table, {
    kind: "barrier",
    method,
    parameters,
    execute: async () => {
      try {
        const html = await fetchHtml(pageUrl.href);
        await executePreparedArray(table, parseTable(html, index, parameters.columns));
      } catch (cause) {
        if (cause instanceof SDAError) throw cause;
        throw new SDAError({ method, parameters, query: "", cause });
      }
    },
  });
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not fetch the HTML page: ${response.status} ${response.statusText}.`);
  }
  return response.text();
}

function elementPattern(tags: string): RegExp {
  return new RegExp(String.raw`<(${tags})(?=[\s>])(${attributes})>([\s\S]*?)<\/\1\s*>`, "gi");
}

function parseTable(html: string, index: number, columns: string[] | undefined) {
  const page = html.replace(/<!--[\s\S]*?-->/g, "").replace(elementPattern("script|style"), "");
  const table = Array.from(page.matchAll(elementPattern("table")))[index];
  if (table === undefined || /<table(?=[\s>])/i.test(table[3])) {
    throw new Error(`Expected a complete HTML table without nested tables at index ${index}.`);
  }

  const body = table[3].replace(elementPattern("caption|colgroup"), "").replace(sectionTags, "");
  const rows = readElements(body, "tr", "table rows").map((row) =>
    readElements(row[3], "th|td", "row cells"),
  );
  const firstRow = rows[0];
  const hasHeader = firstRow?.length && firstRow.every((cell) => cell[1].toLowerCase() === "th");
  if (!hasHeader && columns === undefined) {
    throw new Error("Expected a header row of <th> cells or column names in options.columns.");
  }

  const values = rows.map((row) =>
    row.map((cell) => {
      const cellAttributes = cell[2].replace(/"[^"]*"|'[^']*'/g, "");
      if (/\s(?:rowspan|colspan)\s*=/i.test(cellAttributes) || nestedStructure.test(cell[3])) {
        throw new Error("Expected explicitly closed cells without merged or nested cells.");
      }
      return decodeCell(cell[3]);
    }),
  );

  const keys = columns ?? values[0];
  const data = hasHeader ? values.slice(1) : values;
  if (keys.length === 0 || data.length === 0 || values.some((row) => row.length !== keys.length)) {
    throw new Error(
      "Expected at least one data row and the same number of cells as column names in every row.",
    );
  }
  const names = keys.map((key) => key.replace(/[A-Z]/g, (letter) => letter.toLowerCase()));
  if (keys.some((key) => key === "" || key.includes("\0")) || new Set(names).size !== keys.length) {
    throw new Error("Expected unique, nonempty column names.");
  }

  return {
    keys,
    types: keys.map(() => "VARCHAR"),
    columnsData: keys.map((_, column) => data.map((row) => row[column])),
    rowCount: data.length,
  };
}

function readElements(html: string, tags: string, description: string): RegExpMatchArray[] {
  const pattern = elementPattern(tags);
  if (html.replace(pattern, "").trim() !== "") {
    throw new Error(`Expected explicitly closed ${description}.`);
  }
  return Array.from(html.matchAll(pattern));
}

function decodeCell(html: string): string {
  return html
    .replace(new RegExp(String.raw`<\/?[a-z][\w:-]*(?=[\s/>])${attributes}>`, "gi"), "")
    .replace(/&(#(?:x[\da-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity: string) => {
      const name = entity.toLowerCase();
      if (!name.startsWith("#")) return entities[name];
      const code = name.startsWith("#x") ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff)
        ? String.fromCodePoint(code)
        : "\ufffd";
    })
    .trim();
}
