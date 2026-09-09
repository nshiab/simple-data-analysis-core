import scanSQL from "./scanSQL.ts";

export default function cleanSQL(
  query: string,
  syntax: "js" | "sql" = "js",
): string {
  if (syntax === "sql") return query;
  const tokens = scanSQL(query);
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
  const betweenAnd = new Set<number>();
  for (let i = 0; i < original.length; i++) {
    if (original[i] !== "BETWEEN") continue;
    for (let j = i + 1; j < original.length; j++) {
      if (["(", "[", "CASE"].includes(original[j])) {
        j = pairs.get(j) ?? original.length;
      } else if ([")", "]", "END", ";"].includes(original[j])) break;
      else if (original[j] === "AND") {
        betweenAnd.add(j);
        break;
      }
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
    "SELECT",
    "FROM",
    "WHERE",
    "HAVING",
    "QUALIFY",
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
    "AS",
    "AND",
    "OR",
    "&&",
    ",",
    ";",
  ]);
  const textTypes = new Set(["VARCHAR", "CHAR", "BPCHAR", "TEXT", "STRING"]);

  function range(
    pipe: number,
    start: number,
    end: number,
    stop: (i: number) => boolean,
  ): [number, number] {
    let left = pipe - 1;
    while (left >= start && !stop(left)) {
      if ([")", "]", "END"].includes(original[left])) {
        left = pairs.get(left) ?? start;
      }
      left--;
    }
    let right = pipe + 1;
    while (right < end && !stop(right)) {
      if (["(", "[", "CASE"].includes(original[right])) {
        right = pairs.get(right) ?? end;
      }
      right++;
    }
    return [left + 1, right];
  }

  function predicate(start: number, end: number): boolean {
    if (original[start] === "(" && pairs.get(start) === end - 1) {
      return predicate(start + 1, end - 1);
    }
    for (let i = start; i < end; i++) {
      if (["(", "[", "CASE"].includes(original[i])) i = pairs.get(i) ?? end;
      else if (comparisons.has(original[i])) return true;
    }
    return false;
  }

  // Only infer types that are explicit in the expression. Never infer a
  // column's or an arbitrary function's type from its name or argument types.
  function isTextType(start: number, end: number): boolean {
    return textTypes.has(original[start]) &&
      (start + 1 === end ||
        (original[start + 1] === "(" && pairs.get(start + 1) === end - 1));
  }

  function concatenable(start: number, end: number): boolean {
    if (start >= end) return false;
    let cast: number | undefined;
    let pipe: number | undefined;
    for (let i = start; i < end; i++) {
      if (["(", "[", "CASE"].includes(original[i])) i = pairs.get(i) ?? end;
      else if (comparisons.has(original[i])) return false;
      else if (original[i] === "||") pipe ??= i;
      else if (original[i] === "::") cast = i;
    }
    if (pipe !== undefined) {
      return concatenable(start, pipe) || concatenable(pipe + 1, end);
    }
    // The final cast determines the result type, including casts to BOOLEAN.
    if (cast !== undefined) {
      return isTextType(cast + 1, end);
    }
    if (original[start] === "(" && pairs.get(start) === end - 1) {
      return concatenable(start + 1, end - 1);
    }
    if (original[start] === "[" && pairs.get(start) === end - 1) return true;
    if (end === start + 1) {
      return significant[start].kind === "quoted" &&
        !significant[start].text.startsWith('"');
    }
    if (original[start + 1] === "(" && pairs.get(start + 1) === end - 1) {
      if (["CONCAT", "CONCAT_WS"].includes(original[start])) return true;
      if (["CAST", "TRY_CAST"].includes(original[start])) {
        for (let i = start + 2; i < end - 1; i++) {
          if (["(", "[", "CASE"].includes(original[i])) {
            i = pairs.get(i) ?? end;
          } else if (original[i] === "AS") {
            return isTextType(i + 1, end - 1);
          }
        }
      }
    }
    return false;
  }

  function obviousConcatenation(
    pipe: number,
    start: number,
    end: number,
  ): boolean {
    const [left, right] = range(
      pipe,
      start,
      end,
      (i) =>
        (boundaries.has(original[i]) && !betweenAnd.has(i)) ||
        original[i] === "||",
    );
    // A literal in a comparison is not evidence that the comparison returns text.
    if (predicate(left, pipe) && predicate(pipe + 1, right)) return false;
    const [groupStart, groupEnd] = range(
      pipe,
      start,
      end,
      (i) => boundaries.has(original[i]) || comparisons.has(original[i]),
    );
    let operand = groupStart;
    for (let i = groupStart; i <= groupEnd; i++) {
      if (["(", "[", "CASE"].includes(original[i])) {
        i = pairs.get(i) ?? groupEnd;
      } else if (i === groupEnd || original[i] === "||") {
        // Do not use the RHS literal of a preceding comparison to infer OR's
        // meaning (text = 'a' || active). Other operands can still prove concat.
        if (
          !(operand === groupStart &&
            (comparisons.has(original[groupStart - 1]) ||
              betweenAnd.has(groupStart - 1))) &&
          concatenable(operand, i)
        ) return true;
        operand = i + 1;
      }
    }
    return false;
  }

  function normalize(start: number, end: number) {
    let statement: string | undefined = original[start];
    let inSetClause = false;
    let assignmentTarget = false;
    for (let i = start; i < end; i++) {
      const word = original[i];
      if (statement === undefined) statement = word;
      // Nested queries are visited separately below. Look through statement
      // prefixes to find the outer command that can introduce assignments.
      if (
        ["WITH", "EXPLAIN", "PREPARE"].includes(statement) &&
        ["SELECT", "INSERT", "UPDATE", "DELETE", "MERGE"].includes(word)
      ) statement = word;
      if (
        word === "UPDATE" && ["DO", "THEN"].includes(original[i - 1])
      ) statement = word;
      if (["(", "[", "CASE"].includes(word)) {
        const close = pairs.get(i);
        if (close !== undefined) {
          normalize(i + 1, close);
          i = close;
          continue;
        }
      }
      if (["WHERE", "HAVING", "QUALIFY", "WHEN"].includes(word)) {
        statement = word;
        inSetClause = false;
        assignmentTarget = false;
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
        statement = word;
        inSetClause = false;
        assignmentTarget = false;
      } else if (
        word === "SET" && !inSetClause &&
        (statement === "UPDATE" ||
          (statement === "SET" &&
            (original[i + 1] === "VARIABLE" || original[i + 2] === "=")))
      ) {
        inSetClause = true;
        assignmentTarget = true;
      } else if (word === "," && inSetClause) assignmentTarget = true;
      if (word === ";") statement = undefined;

      // Preserve only the assignment operator itself. Comparisons in its RHS
      // still use shorthand, even when they are not wrapped in parentheses.
      const assignment = assignmentTarget && ["=", "==", "==="].includes(word);
      if (assignment) assignmentTarget = false;

      const token = significant[i];
      if (["==", "==="].includes(word)) token.text = "=";
      else if (word === "!==") token.text = "!=";
      else if (word === "&&") token.text = " AND ";
      else if (word === "||" && !obviousConcatenation(i, start, end)) {
        token.text = " OR ";
      }
      if (original[i + 1] === "NULL" && !assignment) {
        if (["=", "==", "==="].includes(word)) token.text = " IS ";
        else if (["!=", "!=="].includes(word)) token.text = " IS NOT ";
      }
    }
  }
  normalize(0, significant.length);
  return tokens.map((token) => token.text).join("").trim();
}
