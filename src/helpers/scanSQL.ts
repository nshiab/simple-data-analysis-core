type Token = { text: string; kind: "sql" | "quoted" | "trivia" };

// Keep opaque SQL regions byte-for-byte intact. Only SQL tokens participate in
// normalization; parameter values never enter this module.
export default function scanSQL(query: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < query.length) {
    const start = i;
    let kind: Token["kind"] = "sql";
    const rest = query.slice(i);
    if (/\s/.test(query[i])) {
      kind = "trivia";
      while (i < query.length && /\s/.test(query[i])) i++;
    } else if (rest.startsWith("--")) {
      kind = "trivia";
      while (i < query.length && !/[\r\n]/.test(query[i])) i++;
    } else if (rest.startsWith("/*")) {
      kind = "trivia";
      i += 2;
      let depth = 1;
      while (i < query.length && depth > 0) {
        if (query.startsWith("/*", i)) {
          depth++;
          i += 2;
        } else if (query.startsWith("*/", i)) {
          depth--;
          i += 2;
        } else i++;
      }
    } else if (/^[eE]'/.test(rest) || query[i] === "'" || query[i] === '"') {
      kind = "quoted";
      const escaped = /^[eE]'/.test(rest);
      if (escaped) i++;
      const quote = query[i++];
      while (i < query.length) {
        if (escaped && query[i] === "\\") i = Math.min(i + 2, query.length);
        else if (query[i++] === quote) {
          if (query[i] === quote) i++;
          else break;
        }
      }
    } else {
      // DuckDB permits non-ASCII characters in dollar tags, including
      // combining marks and characters outside the Unicode letter categories.
      const dollar = rest.match(
        /^\$(?:[A-Za-z_\u0080-\uFFFF][A-Za-z_0-9\u0080-\uFFFF]*)?\$/,
      )?.[0];
      if (dollar) {
        kind = "quoted";
        const end = query.indexOf(dollar, i + dollar.length);
        i = end === -1 ? query.length : end + dollar.length;
      } else {
        const token = rest.match(
          /^(?:[\p{L}_][\p{L}\p{N}_$]*|\$(?:[0-9]+|[\p{L}_][\p{L}\p{N}_]*)|!==|===|==|!=|<>|<=|>=|&&|\|\||::)/u,
        )?.[0];
        i += token?.length ?? 1;
      }
    }
    tokens.push({ text: query.slice(start, i), kind });
  }
  return tokens;
}
