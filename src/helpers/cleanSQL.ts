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
          /^(?:[\p{L}_][\p{L}\p{N}_$]*|\$[0-9]+|!==|===|==|!=|<>|<=|>=|&&|\|\||::)/u,
        )?.[0];
        i += token?.length ?? 1;
      }
    }
    tokens.push({ text: query.slice(start, i), kind });
  }
  return tokens;
}

export default function cleanSQL(query: string): string {
  const tokens = scan(query);
  const significant = tokens.filter((token) => token.kind !== "trivia");
  const original = significant.map((token) =>
    token.kind === "sql" ? token.text.toUpperCase() : ""
  );
  const pairs = new Map<number, number>();
  const stack: number[] = [];
  for (let i = 0; i < original.length; i++) {
    if (original[i] === "(") stack.push(i);
    else if (original[i] === ")" && stack.length) {
      const start = stack.pop()!;
      pairs.set(start, i);
      pairs.set(i, start);
    }
  }
  const comparisons = new Set([
    "=",
    "==",
    "===",
    "!=",
    "!==",
    "<>",
    "<",
    ">",
    "<=",
    ">=",
    "IS",
    "IN",
    "LIKE",
    "ILIKE",
    "BETWEEN",
  ]);
  const boundaries = new Set([
    "AND",
    "OR",
    "&&",
    "||",
    "WHERE",
    "HAVING",
    "QUALIFY",
    "SELECT",
    "FROM",
    "GROUP",
    "ORDER",
    "LIMIT",
    "RETURNING",
    "UNION",
    "EXCEPT",
    "INTERSECT",
    "WHEN",
    "THEN",
    "ELSE",
    "END",
    ",",
    ";",
  ]);

  function predicate(start: number, end: number): boolean {
    if (start >= end) return false;
    if (original[start] === "NOT") return predicate(start + 1, end);
    if (pairs.get(start) === end - 1) return predicate(start + 1, end - 1);
    if (end === start + 1) return ["TRUE", "FALSE"].includes(original[start]);
    if (original[start] === "EXISTS" && pairs.get(start + 1) === end - 1) {
      return true;
    }
    for (let i = start; i < end; i++) {
      if (original[i] === "(") {
        i = pairs.get(i) ?? end;
      } else if (["AND", "OR", "&&", "||"].includes(original[i])) {
        return predicate(start, i) && predicate(i + 1, end);
      } else if (comparisons.has(original[i])) return true;
    }
    return false;
  }

  function normalize(start: number, end: number, inWhere: boolean) {
    let assignment = false;
    for (let i = start; i < end; i++) {
      const word = original[i];
      if (word === "(") {
        const close = pairs.get(i);
        if (close !== undefined) {
          normalize(i + 1, close, inWhere);
          i = close;
          continue;
        }
      }
      if (["WHERE", "HAVING", "QUALIFY"].includes(word)) {
        inWhere = true;
        assignment = false;
      } else if (
        [
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
        inWhere = false;
        assignment = false;
      } else if (word === "SET") assignment = true;

      const token = significant[i];
      if (["==", "==="].includes(word)) token.text = "=";
      else if (word === "!==") token.text = "!=";
      else if (word === "&&") token.text = " AND ";
      else if (word === "||" && inWhere) {
        let left = i - 1;
        while (left >= start && !boundaries.has(original[left])) {
          if (original[left] === ")") left = pairs.get(left) ?? start;
          left--;
        }
        let right = i + 1;
        while (right < end && !boundaries.has(original[right])) {
          if (original[right] === "(") right = pairs.get(right) ?? end;
          right++;
        }
        // SQL also uses || for concatenation. Bare identifiers/functions have
        // unknown types, so only explicit predicates opt into logical shorthand.
        if (predicate(left + 1, i) && predicate(i + 1, right)) {
          token.text = " OR ";
        }
      }
      if (original[i + 1] === "NULL" && !assignment) {
        if (["=", "==", "==="].includes(word)) token.text = " IS ";
        else if (["!=", "!=="].includes(word)) token.text = " IS NOT ";
      }
    }
  }
  normalize(0, significant.length, false);
  return tokens.map((token) => token.text).join("").trim();
}
