type Token = {
  kind: "word" | "punctuation" | "literal" | "template";
  text: string;
  lineBreak: boolean;
};

const lineTerminator = /[\r\n\u2028\u2029]/u;
const word = /^[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*/u;
const number =
  /^(?:0[xX][\da-fA-F_]+n?|0[bB][01_]+n?|0[oO][0-7_]+n?|(?:\d[\d_]*(?:\.[\d_]*)?|\.[\d_]+)(?:[eE][+-]?[\d_]+)?n?)/;
const punctuation =
  /^(?:>>>=|===|!==|\*\*=|&&=|\|\|=|\?\?=|>>>|<<=|>>=|=>|==|!=|<=|>=|\+\+|--|&&|\|\||\?\?|\?\.(?!\d)|\*\*|<<|>>|\+=|-=|\*=|%=|&=|\|=|\^=|\.\.\.|[{}()[\].,;:?~!+*%<>=&|^\-#])/;
const expressionPrefixes = new Set([
  "(",
  "[",
  "{",
  ",",
  ";",
  ":",
  "?",
  "=",
  "=>",
  "!",
  "~",
  "+",
  "-",
  "*",
  "**",
  "%",
  "&",
  "|",
  "^",
  "&&",
  "||",
  "??",
  "==",
  "===",
  "!=",
  "!==",
  "<",
  ">",
  "<=",
  ">=",
  "<<",
  ">>",
  ">>>",
  "+=",
  "-=",
  "*=",
  "**=",
  "%=",
  "&=",
  "|=",
  "^=",
  "&&=",
  "||=",
  "??=",
  "<<=",
  ">>=",
  ">>>=",
  "/",
  "/=",
]);
const expressionKeywords = new Set([
  "return",
  "throw",
  "case",
  "delete",
  "void",
  "typeof",
  "new",
  "in",
  "instanceof",
  "yield",
  "await",
  "else",
  "do",
]);
const restrictedLineBreaks = new Set([
  "return",
  "throw",
  "break",
  "continue",
  "yield",
  "async",
  "++",
  "--",
]);

/**
 * Normalizes comments, whitespace, and known optional punctuation without
 * dependencies or executing user code. Literal contents and token boundaries
 * stay intact. Potentially significant line breaks are retained; ambiguous
 * slash syntax falls back to exact source instead of risking a stale cache hit.
 */
export default function normalizeCacheCode(source: string): string {
  let position = 0;
  let uncertain = false;

  function quoted(quote: string): string | undefined {
    const start = position++;
    while (position < source.length) {
      const character = source[position++];
      if (character === "\\") {
        position++;
      } else if (character === quote) {
        return source.slice(start, position);
      } else if (lineTerminator.test(character)) {
        return undefined;
      }
    }
  }

  function template(): string | undefined {
    const parts: string[] = [];
    let start = ++position;
    while (position < source.length) {
      if (source[position] === "\\") {
        position += 2;
      } else if (source[position] === "`") {
        parts.push(source.slice(start, position++));
        return JSON.stringify(parts);
      } else if (source.startsWith("${", position)) {
        parts.push(source.slice(start, position));
        position += 2;
        const tokens = scan(true);
        if (uncertain) return undefined;
        parts.push(serialize(tokens));
        start = position;
      } else {
        position++;
      }
    }
  }

  function regex(): string | undefined {
    const start = position++;
    let inClass = false;
    while (position < source.length) {
      const character = source[position++];
      if (lineTerminator.test(character)) return undefined;
      if (character === "\\") {
        position++;
      } else if (character === "[") {
        // Nested character classes depend on the v flag. Leave these opaque.
        if (inClass) return undefined;
        inClass = true;
      } else if (character === "]") {
        inClass = false;
      } else if (character === "/" && !inClass) {
        const flags = source.slice(position).match(word)?.[0] ?? "";
        position += flags.length;
        return source.slice(start, position);
      }
    }
  }

  function scan(interpolation = false): Token[] {
    const tokens: Token[] = [];
    let braces = 0;
    let lineBreak = false;
    while (position < source.length) {
      const rest = source.slice(position);
      const character = source[position];
      if (/\s/u.test(character)) {
        lineBreak ||= lineTerminator.test(character);
        position++;
        continue;
      }
      if (rest.startsWith("//")) {
        while (
          position < source.length && !lineTerminator.test(source[position])
        ) {
          position++;
        }
        continue;
      }
      if (rest.startsWith("/*")) {
        const end = source.indexOf("*/", position + 2);
        if (end === -1) break;
        lineBreak ||= lineTerminator.test(source.slice(position, end + 2));
        position = end + 2;
        continue;
      }
      if (interpolation && character === "}" && braces === 0) {
        position++;
        return tokens;
      }
      // Legacy HTML comments and native function text are not ordinary tokens.
      if (
        rest.startsWith("<!--") || rest.startsWith("-->") ||
        rest.startsWith("[native code]")
      ) break;

      const previous = tokens.at(-1);
      let kind: Token["kind"] = "punctuation";
      let text: string | undefined;
      if (character === "'" || character === '"') {
        kind = "literal";
        text = quoted(character);
      } else if (character === "`") {
        kind = "template";
        text = template();
      } else if (character === "/") {
        const property = [".", "?."].includes(tokens.at(-2)?.text ?? "");
        if (
          !previous ||
          (previous.kind === "punctuation" &&
            expressionPrefixes.has(previous.text)) ||
          (previous.kind === "word" && !property &&
            expressionKeywords.has(previous.text))
        ) {
          kind = "literal";
          text = regex();
        } else if (
          previous.kind === "literal" || previous.kind === "template"
        ) {
          text = rest.startsWith("/=") ? "/=" : "/";
          position += text.length;
        } else {
          // After a closing block/parenthesis or contextual keyword, deciding
          // between division and a regex can require a full JavaScript parser.
          break;
        }
      } else {
        text = rest.match(word)?.[0];
        if (text !== undefined) {
          kind = "word";
        } else {
          text = rest.match(number)?.[0];
          if (text !== undefined) kind = "literal";
          else text = rest.match(punctuation)?.[0];
        }
        if (text !== undefined) position += text.length;
      }
      if (text === undefined) {
        uncertain = true;
        break;
      }
      if (kind === "punctuation") {
        if (text === "{") braces++;
        if (text === "}") braces--;
      }
      tokens.push({ kind, text, lineBreak });
      lineBreak = false;
    }
    if (position < source.length || interpolation) uncertain = true;
    return tokens;
  }

  const tokens = scan();
  return uncertain
    ? JSON.stringify(["source", source])
    : JSON.stringify(["tokens", serialize(tokens)]);
}

function serialize(tokens: Token[]): string {
  tokens = normalizePunctuation(tokens);
  return JSON.stringify(tokens.map((token, index) => {
    const previous = tokens[index - 1];
    // Only discard newlines where continuation is certain. Keeping other
    // newlines permits conservative misses rather than unsafe cache hits.
    const significant = token.lineBreak && previous !== undefined && (
      restrictedLineBreaks.has(previous.text) ||
      ["++", "--"].includes(token.text) ||
      !(
        (previous.kind === "punctuation" &&
          (expressionPrefixes.has(previous.text) ||
            [".", "?.", "}"].includes(previous.text))) ||
        (token.kind === "punctuation" &&
          ([")", "]", "}", ",", ";", ".", "?."].includes(token.text) ||
            (expressionPrefixes.has(token.text) &&
              !["(", "[", "{", "!", "~"].includes(token.text))))
      )
    );
    return [token.kind, token.text, significant];
  }));
}

function normalizePunctuation(input: Token[]): Token[] {
  const tokens = input.map((token) => ({ ...token }));
  const result: Token[] = [];
  const brackets: { text: string; control: boolean }[] = [];
  const controls = new Set(["if", "while", "for", "with", "switch", "catch"]);
  let previousControl = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];
    const previous = result.at(-1);
    if (
      token.kind === "literal" && /^["']/.test(token.text) &&
      !token.text.includes("\\")
    ) {
      token.text = JSON.stringify(token.text.slice(1, -1));
    }
    // A single arrow parameter has the same binding with or without parentheses.
    if (
      token.text === "(" && tokens[i + 1]?.kind === "word" &&
      tokens[i + 2]?.text === ")" && tokens[i + 3]?.text === "=>"
    ) {
      result.push({ ...tokens[i + 1], lineBreak: token.lineBreak });
      i += 2;
      previousControl = false;
      continue;
    }
    // Retain commas representing array holes, including the final hole.
    if (
      token.text === "," && [")", "]", "}"].includes(next?.text ?? "") &&
      previous && ![",", "[", "("].includes(previous.text)
    ) continue;

    const expressionEnd = previous && (
      previous.kind !== "punctuation" || previous.text === "]" ||
      (previous.text === ")" && !previousControl)
    );
    if (
      token.text === ";" && brackets.at(-1)?.text === "{" && expressionEnd &&
      !restrictedLineBreaks.has(previous.text)
    ) {
      if (next?.text === "}") continue;
      // A call followed by an identifier starts a new statement. Preserve that
      // boundary as a newline so explicit and automatically inserted semicolons
      // agree. Never do this in a for header or after a control header.
      if (
        previous.text === ")" && next?.kind === "word" &&
        !["in", "instanceof", "of"].includes(next.text)
      ) {
        next.lineBreak = true;
        continue;
      }
    }
    previousControl = false;
    if (["(", "[", "{"].includes(token.text)) {
      brackets.push({
        text: token.text,
        control: token.text === "(" && (controls.has(previous?.text ?? "") ||
          (previous?.text === "await" && result.at(-2)?.text === "for")),
      });
    } else if ([")", "]", "}"].includes(token.text)) {
      previousControl = brackets.pop()?.control ?? false;
    }
    result.push(token);
  }
  return result;
}
