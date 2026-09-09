type Token = { text: string; kind: "sql" | "quoted" | "trivia" };

// Keep opaque SQL regions byte-for-byte intact. Only SQL tokens participate in
// normalization; parameter values never enter this module.
function scan(query: string): Token[] {
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
      const dollar = rest.match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0];
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

export default function cleanSQL(
  query: string,
  syntax: "js" | "sql" = "js",
): string {
  if (syntax === "sql") return query;
  const tokens = scan(query);
  const significant = tokens.filter((token) => token.kind !== "trivia");
  const original = significant.map((token) =>
    token.kind === "sql" ? token.text.toUpperCase() : ""
  );
  const pairs = new Map<number, number>();
  const stack: number[] = [];
  for (let i = 0; i < original.length; i++) {
    if (["(", "[", "CASE"].includes(original[i])) stack.push(i);
    else if (
      stack.length &&
      ((original[i] === ")" && original[stack[stack.length - 1]] === "(") ||
        (original[i] === "]" && original[stack[stack.length - 1]] === "[") ||
        (original[i] === "END" && original[stack[stack.length - 1]] === "CASE"))
    ) {
      const start = stack.pop()!;
      pairs.set(start, i);
      pairs.set(i, start);
    }
  }
  function normalize(start: number, end: number) {
    let assignment = false;
    for (let i = start; i < end; i++) {
      const word = original[i];
      if (["(", "[", "CASE"].includes(word)) {
        const close = pairs.get(i);
        if (close !== undefined) {
          normalize(i + 1, close);
          i = close;
          continue;
        }
      }
      if (["WHERE", "HAVING", "QUALIFY", "WHEN"].includes(word)) {
        assignment = false;
      } else if (
        [
          "THEN",
          "ELSE",
          "SELECT",
          "FROM",
          "GROUP",
          "ORDER",
          "LIMIT",
          "RETURNING",
          "UNION",
          "EXCEPT",
          "INTERSECT",
          ";",
        ].includes(word)
      ) {
        assignment = false;
      } else if (word === "SET") assignment = true;

      const token = significant[i];
      if (["==", "==="].includes(word)) token.text = "=";
      else if (word === "!==") token.text = "!=";
      else if (word === "&&") token.text = " AND ";
      else if (word === "||") token.text = " OR ";
      if (original[i + 1] === "NULL" && !assignment) {
        if (["=", "==", "==="].includes(word)) token.text = " IS ";
        else if (["!=", "!=="].includes(word)) token.text = " IS NOT ";
      }
    }
  }
  normalize(0, significant.length);
  return tokens.map((token) => token.text).join("").trim();
}
