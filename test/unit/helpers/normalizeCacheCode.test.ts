import { assertEquals, assertNotEquals } from "@std/assert";
import normalizeCacheCode from "../../../src/helpers/normalizeCacheCode.ts";

const equivalentSources = [
  [
    "indentation and comments",
    "() => { run(); }",
    `() => {
    // A line comment
    /* A block comment */ run();
  }`,
  ],
  [
    "formatter punctuation",
    "(table) => { table.loadArray([{ value: 'a' }]); }",
    'table => { table.loadArray([{ value: "a", },]) }',
  ],
  [
    "template expressions",
    "() => `hello ${value + 1}`",
    "() => `hello ${ value /* comment */ + 1 }`",
  ],
  [
    "method syntax",
    "async run(table) { await table.log(); }",
    "async run ( table ) { /* log */ await table.log() }",
  ],
  [
    "class syntax",
    "class Strategy { run() { return 1; } }",
    "class Strategy { /* method */ run () { return 1 } }",
  ],
  [
    "regex and division",
    "() => /a \\/ b/.test(value) && 4 / 2",
    "() => /a \\/ b/.test( value ) /* divide */ && 4/2",
  ],
  ["private fields", "() => this.#value", "() => this /* comment */ .#value"],
];

for (const [name, before, after] of equivalentSources) {
  Deno.test(`normalizeCacheCode ignores ${name}`, () => {
    assertEquals(normalizeCacheCode(before), normalizeCacheCode(after));
  });
}

const differentSources = [
  ["string whitespace", '() => "a b"', '() => "a  b"'],
  [
    "comment-like string contents",
    '() => "https://host/* path */"',
    '() => "https://host/* other */"',
  ],
  ["template whitespace", "() => `a b`", "() => `a  b`"],
  [
    "tagged template raw escapes",
    "() => String.raw`a\\nb`",
    "() => String.raw`a\nb`",
  ],
  ["regex whitespace", "() => /a b/", "() => /a  b/"],
  ["regex flags", "() => /a/g", "() => /a/i"],
  ["return line break", "() => { return 1; }", "() => { return\n1; }"],
  [
    "line break in a comment",
    "() => { return /* text */ 1; }",
    "() => { return /* text\n */ 1; }",
  ],
  ["update operator line break", "() => { a\n++b; }", "() => { a++\nb; }"],
  ["operator boundaries", "() => a + +b", "() => a++ + b"],
  [
    "strict directive",
    'function () { "use strict"; return this; }',
    'function () { "use\\x20strict"; return this; }',
  ],
  ["infinite numeric literals", "() => 1e999", "() => null"],
  ["bigint values", "() => 1n", "() => 2n"],
  ["bigint and string", "() => 1n", '() => "1"'],
  ["array holes", "() => [1,]", "() => [1,,]"],
  ["code changes", "() => value + 1", "() => value + 2"],
];

for (const [name, before, after] of differentSources) {
  Deno.test(`normalizeCacheCode preserves ${name}`, () => {
    assertNotEquals(normalizeCacheCode(before), normalizeCacheCode(after));
  });
}

Deno.test("normalizeCacheCode falls back to exact source for unsupported syntax", () => {
  for (
    const source of [
      "function () { [native code] }",
      "() => @value",
    ]
  ) {
    assertEquals(
      normalizeCacheCode(source),
      JSON.stringify(["source", source]),
    );
    assertNotEquals(
      normalizeCacheCode(source),
      normalizeCacheCode(`${source} `),
    );
  }
});

// These are actual JavaScript sources, not transpiled callbacks: each gap is a
// position at which changing whitespace or adding comments leaves the code intact.
const formattingFixtures = [
  [
    "array and object literals",
    "() => {<gap>const rows<gap>=<gap>[{<gap>value:<gap>1<gap>}];<gap>return rows;<gap>}",
  ],
  [
    "method chains",
    '(table) => {<gap>table<gap>.<gap>loadArray([{ value: 1 }])<gap>.<gap>filter("value > 0");<gap>}',
  ],
  [
    "async callback",
    "async (table) => {<gap>await table.loadArray([{ value: 1 }]);<gap>await table.log();<gap>}",
  ],
  [
    "nested function",
    "() => {<gap>function compute(value) {<gap>return value + 1;<gap>}<gap>return compute(2);<gap>}",
  ],
  [
    "branching",
    "() => {<gap>if (ready) {<gap>run();<gap>} else {<gap>stop();<gap>}<gap>}",
  ],
  [
    "loop",
    "() => {<gap>for (let i = 0;<gap>i < 2;<gap>i++) {<gap>run(i);<gap>}<gap>}",
  ],
  [
    "destructuring",
    "({<gap>value,<gap>nested:<gap>{<gap>count<gap>}<gap>}) => [<gap>value,<gap>count<gap>]",
  ],
  ["rest and spread", "(...values) => [<gap>...values,<gap>1<gap>]"],
  ["optional chaining", "() => item<gap>?.<gap>value<gap>??<gap>0"],
  ["conditional expression", "() => ready<gap>?<gap>1<gap>:<gap>0"],
  ["numeric operators", "() => 1<gap>+<gap>2<gap>*<gap>3"],
  ["logical operators", "() => left<gap>&&<gap>right<gap>||<gap>fallback"],
  [
    "regex literal",
    "() => {<gap>const pattern<gap>=<gap>/https?:\\/\\/[^ ]+/gi;<gap>return pattern.test(url);<gap>}",
  ],
  [
    "regex character class",
    "() => {<gap>const pattern<gap>=<gap>/[/* ]+/;<gap>return pattern.test(value);<gap>}",
  ],
  ["template interpolation", "() => `value: ${<gap>value<gap>+<gap>1<gap>}`"],
  ["nested template", "() => `outer ${<gap>`inner ${<gap>value<gap>}`<gap>}`"],
  [
    "template object expression",
    "() => `value ${<gap>({<gap>value:<gap>1<gap>}).value<gap>}`",
  ],
  ["tagged template", "() => String.raw`value ${<gap>value<gap>+<gap>1<gap>}`"],
  [
    "unicode identifiers",
    "(é, 变量) => {<gap>const résultat<gap>=<gap>é + 变量;<gap>return résultat;<gap>}",
  ],
  [
    "bigint and numeric separators",
    "() => [<gap>1_000n,<gap>0xff,<gap>1.5e+2,<gap>.5<gap>]",
  ],
  ["generator", "function* () {<gap>yield 1;<gap>yield* values;<gap>}"],
  [
    "class and private fields",
    "class Example {<gap>#value = 1;<gap>read() {<gap>return this.#value;<gap>}<gap>}",
  ],
  [
    "comments next to literals",
    '() => [<gap>"// text",<gap>"/* text */",<gap>`// text`,<gap>/[/*]/<gap>]',
  ],
];
const formattingGaps = [
  ["spaces and tabs", " \t  "],
  ["line wrapping", "\n    "],
  ["block comments", " /* comment */ "],
  ["multiline block comments", " /* first\nsecond */ "],
  ["line comments", " // explanation\n    "],
  ["CRLF", "\r\n\t"],
  ["Unicode line separators", "\u2028\u2029"],
];
for (const [name, fixture] of formattingFixtures) {
  for (const [change, gap] of formattingGaps) {
    Deno.test(`normalizeCacheCode ignores ${change} in ${name}`, () => {
      assertEquals(
        normalizeCacheCode(fixture.replaceAll("<gap>", " ")),
        normalizeCacheCode(fixture.replaceAll("<gap>", gap)),
      );
    });
  }
}

const semanticFixtures = [
  ["escaped spaces", '() => "a\\tb"', '() => "a b"'],
  ["escaped quote", String.raw`() => 'a\'b'`, String.raw`() => 'a"b'`],
  ["template comment text", "() => `a /* comment */ b`", "() => `a b`"],
  [
    "template line comment text",
    "() => `https://host/path`",
    "() => `https://host/other`",
  ],
  [
    "template indentation",
    "() => `first\n  second`",
    "() => `first\n    second`",
  ],
  ["nested template text", "() => `outer ${`a b`}`", "() => `outer ${`a  b`}`"],
  ["template expression values", "() => `value ${1}`", "() => `value ${2}`"],
  [
    "template expression ASI",
    "() => `${(() => { return 1; })()}`",
    "() => `${(() => { return\n1; })()}`",
  ],
  [
    "regex escaped whitespace",
    String.raw`() => /a\sb/`,
    String.raw`() => /a b/`,
  ],
  ["regex character class whitespace", "() => /[a b]/", "() => /[ab]/"],
  [
    "regex comment-like text",
    String.raw`() => /\/\/a/`,
    String.raw`() => /\/\/b/`,
  ],
  ["division operands", "() => value / 2", "() => value / 3"],
  [
    "division versus regex after a block",
    "() => { if (ready) {} /a b/.test(value); }",
    "() => { if (ready) {} /a  b/.test(value); }",
  ],
  [
    "regex after a control header",
    "() => { if (ready) /a b/.test(value); }",
    "() => { if (ready) /a  b/.test(value); }",
  ],
  [
    "break labels",
    "() => { outer: while (true) { break outer; } }",
    "() => { outer: while (true) { break\nouter; } }",
  ],
  [
    "continue labels",
    "() => { outer: while (true) { continue outer; } }",
    "() => { outer: while (true) { continue\nouter; } }",
  ],
  [
    "yield line break",
    "function* () { yield 1; }",
    "function* () { yield\n1; }",
  ],
  [
    "async function line break",
    "() => { async function run() {} }",
    "() => { async\nfunction run() {} }",
  ],
  ["Unicode ASI", "() => { return 1; }", "() => { return\u20281; }"],
  ["CRLF ASI", "() => { return 1; }", "() => { return\r\n1; }"],
  [
    "line comment ASI",
    "() => { return /* note */ 1; }",
    "() => { return // note\n1; }",
  ],
  [
    "empty loop body",
    "() => { while (ready); run(); }",
    "() => { while (ready) run(); }",
  ],
  [
    "empty conditional body",
    "() => { if (ready); run(); }",
    "() => { if (ready) run(); }",
  ],
  [
    "statement versus call continuation",
    "() => { run(); (next)(); }",
    "() => { run()\n(next)(); }",
  ],
  [
    "statement versus array access",
    "() => { run(); [0].map(next); }",
    "() => { run()\n[0].map(next); }",
  ],
  [
    "statement versus tagged template",
    "() => { run(); `value`; }",
    "() => { run()\n`value`; }",
  ],
  [
    "for loop separators",
    "() => { for (let i = 0; i < 1; i++) run(); }",
    "() => { for (let i = 0; i < 2; i++) run(); }",
  ],
  ["two array holes", "() => [1,,]", "() => [1,,,]"],
  ["comment token boundary", "() => a + /* note */ +b", "() => a++ + b"],
  ["numeric exponent sign", "() => 1e+2", "() => 1e-2"],
];
for (const [name, before, after] of semanticFixtures) {
  Deno.test(`normalizeCacheCode invalidates for ${name}`, () => {
    assertNotEquals(normalizeCacheCode(before), normalizeCacheCode(after));
  });
}
