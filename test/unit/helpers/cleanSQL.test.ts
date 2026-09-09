import { assertEquals } from "@std/assert";
import cleanSQL from "../../../src/helpers/cleanSQL.ts";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import queryDB from "../../../src/helpers/queryDB.ts";
import mergeOptions from "../../../src/helpers/mergeOptions.ts";

Deno.test("SQL normalization preserves Unicode dollar-quoted payloads", async () => {
  const sdb = new SimpleDB();
  try {
    for (const tag of ["é", "数据", "e\u0301", "🙂", "tag_é1"]) {
      const value = "a == b || c !== null /* ' */";
      const query = `SELECT $${tag}$${value}$${tag}$ AS value WHERE 1===1`;
      assertEquals(await sdb.customQuery(query, { returnData: true }), [{
        value,
      }]);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("SQL normalization preserves parameterized text casts", async () => {
  const sdb = new SimpleDB();
  try {
    for (const type of ["VARCHAR(10)", "CHAR(10)", "TEXT(10)"]) {
      for (
        const expression of [
          `CAST(12 AS ${type})`,
          `TRY_CAST(12 AS ${type})`,
          `12::${type}`,
          `CAST(CAST(12 AS INTEGER) AS ${type})`,
        ]
      ) {
        const query = `SELECT ${expression} || 34 AS value`;
        assertEquals(await sdb.customQuery(query, { returnData: true }), [{
          value: "1234",
        }]);
      }
    }
    assertEquals(
      await sdb.customQuery(
        "SELECT 'false'::VARCHAR(10)::BOOLEAN || true AS value",
        { returnData: true },
      ),
      [{ value: true }],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("SQL normalization distinguishes SET columns from assignments", async () => {
  const sdb = new SimpleDB();
  try {
    for (
      const expression of [
        "set == null",
        "t.set == null",
        "(set == null)",
        "(t.set == null)",
      ]
    ) {
      assertEquals(
        await sdb.customQuery(
          `SELECT ${expression} AS value FROM (VALUES (NULL)) t(set)`,
          { returnData: true },
        ),
        [{ value: true }],
      );
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("SQL normalization preserves assignments and translates their RHS null checks", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(
      "CREATE TABLE updates (x INTEGER, b BOOLEAN, c BOOLEAN, set INTEGER); INSERT INTO updates VALUES (1, false, false, 1), (NULL, false, false, NULL)",
    );
    await sdb.customQuery(
      "UPDATE updates SET b = x == null, c = set !== null, set = null",
    );
    assertEquals(
      await sdb.customQuery("SELECT * FROM updates ORDER BY x NULLS LAST", {
        returnData: true,
      }),
      [{ x: 1, b: false, c: true, set: null }, {
        x: null,
        b: true,
        c: false,
        set: null,
      }],
    );
    await sdb.customQuery(
      "WITH source AS (SELECT 1) UPDATE updates SET b = set == null, c = null FROM source WHERE set == null",
    );
    assertEquals(
      await sdb.customQuery("SELECT b, c FROM updates", { returnData: true }),
      [{ b: true, c: null }, { b: true, c: null }],
    );
    await sdb.customQuery(
      "UPDATE updates SET (b, c) = (x == null, x !== null); SELECT set == null FROM updates",
    );
    assertEquals(
      await sdb.customQuery("SELECT b, c FROM updates ORDER BY x NULLS LAST", {
        returnData: true,
      }),
      [{ b: false, c: true }, { b: true, c: false }],
    );
    await sdb.customQuery("SET VARIABLE missing = null");
    assertEquals(
      await sdb.customQuery("SELECT getvariable('missing') IS NULL AS value", {
        returnData: true,
      }),
      [{ value: true }],
    );
    await sdb.customQuery(
      "PREPARE reset_values AS UPDATE updates SET b = null",
    );
    await sdb.customQuery("EXECUTE reset_values");
    await sdb.customQuery("EXPLAIN UPDATE updates SET b = null");
    assertEquals(
      await sdb.customQuery("SELECT b FROM updates", { returnData: true }),
      [{ b: null }, { b: null }],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("SQL normalization preserves opaque regions", () => {
  for (
    const opaque of [
      "'a == b && c !== null || d'",
      "'it''s == null'",
      '"a "" == b"',
      String.raw`E'it\'s == null'`,
      "$$a == b || null$$",
      "$tag$a == b || null$tag$",
      "/* == null /* nested */ || */",
      "-- == null ||\n",
    ]
  ) {
    assertEquals(
      cleanSQL(`SELECT ${opaque} WHERE x==1`),
      `SELECT ${opaque} WHERE x=1`,
    );
  }
});

Deno.test("SQL normalization preserves concatenation and assignment", () => {
  for (
    const sql of [
      "SELECT a || b FROM t WHERE a || b = 'xy'",
      "SELECT * FROM t WHERE 'xy' = (a || b)",
      "UPDATE t SET a = null WHERE b IS NULL",
      "SELECT * FROM t WHERE x >= null",
      "SELECT * FROM t WHERE EXISTS (SELECT a || b FROM t)",
    ]
  ) assertEquals(cleanSQL(sql, "sql"), sql);
});

Deno.test("SQL shorthand works in nested predicates and across comments", async () => {
  const sdb = new SimpleDB();
  try {
    const result = await sdb.newTable("strings")
      .loadArray([{ text: "a == b", n: 1 }, { text: "a = b", n: 2 }])
      .filter("(text = 'a == b' && n==1) || (n===3)")
      .addColumn("joined", "string", "concat(text, '!')")
      .getData();
    assertEquals(result, [{ text: "a == b", n: 1, joined: "a == b!" }]);
    const data = await queryDB(
      sdb,
      `SELECT ? AS bound, 'it''s == null' AS escaped
      WHERE (((NULL==/* preserved */null) && (1===1)) || (2===3)) && (concat('a', 'b') = 'ab')
      && (1!==2 || 2===3)`,
      mergeOptions(sdb, {
        table: null,
        method: null,
        parameters: null,
        returnData: true,
        values: ["a == b && c || d"],
      }),
    );
    assertEquals(data, [{
      bound: "a == b && c || d",
      escaped: "it's == null",
    }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("SQL normalization scopes nested queries and statement boundaries", async () => {
  const sdb = new SimpleDB();
  try {
    const rows = await queryDB(
      sdb,
      `
      SELECT concat('a', 'b') AS text
      WHERE EXISTS (SELECT concat('x', 'y') WHERE 1==1 || 2==3)
        || (1==2)
      ORDER BY concat('x', 'y');
      SELECT $$a == b$$ AS text WHERE TRUE || FALSE;
    `,
      mergeOptions(sdb, {
        table: null,
        method: null,
        parameters: null,
        returnData: true,
      }),
    );
    assertEquals(rows, [{ text: "ab" }]);
    assertEquals(
      cleanSQL("SELECT 1; SELECT 2 WHERE TRUE||FALSE"),
      "SELECT 1; SELECT 2 WHERE TRUE OR FALSE",
    );
  } finally {
    await sdb.close();
  }
});

// These cases exercise the private scanner through its observable contract:
// quoted/comment text stays intact, and scanning resumes at the right boundary.
const opaqueCases = [
  ["empty string", "''"],
  ["repeated escaped quotes", "''''''"],
  ["SQL backslash before closing quote", String.raw`'a\'`],
  ["escape string backslashes", String.raw`E'a\\b\' == c'`],
  ["lowercase escape prefix", String.raw`e'\' || null'`],
  ["empty identifier", '""'],
  ["escaped identifier quotes", '"a""""b == null"'],
  ["Unicode identifier", '"résumé 数据 == null"'],
  ["SQL keywords in identifier", '"WHERE SET SELECT"'],
  ["dollar string with other tags", "$tag$' $$ $other$ == null$tag$"],
  ["case-sensitive dollar tag", "$Tag$ $tag$ == null $Tag$"],
  ["dollar tag with digits", "$_tag2$ && || !== null $_tag2$"],
  ["empty block comment", "/**/"],
  ["nested block comments", "/* a /* b /* c */ b */ a */"],
  ["quote in block comment", "/* ' \" $$ WHERE == null */"],
  ["comment markers in string", "'-- /* */ == null'"],
  ["line comment LF", "-- ' /* == null\n"],
  ["line comment CR", "-- ' /* == null\r"],
  ["line comment CRLF", "-- ' /* == null\r\n"],
];
for (const [name, opaque] of opaqueCases) {
  Deno.test(`cleanSQL scanner: ${name}`, () => {
    const input = `SELECT ${opaque} WHERE résumé==1`;
    const expected = `SELECT ${opaque} WHERE résumé=1`;
    assertEquals(cleanSQL(input), expected);
    assertEquals(cleanSQL(expected), expected);
  });
}

for (
  const suffix of [
    "'unterminated == null",
    '"unterminated ||',
    "/* nested /* */ ==",
    "-- == null",
    "$tag$wrong $TAG$ == null",
    "E'ends with" + "\\",
  ]
) {
  Deno.test(`cleanSQL leaves unfinished region intact: ${JSON.stringify(suffix)}`, () => {
    assertEquals(cleanSQL(`SELECT 1==1; ${suffix}`), `SELECT 1=1; ${suffix}`);
  });
}

for (
  const [input, expected] of [
    ["", ""],
    [" \t\r\n ", ""],
    ["  SELECT 1  ", "SELECT 1"],
    [
      "SELECT ?,$1,$where,$set,$null WHERE x==1",
      "SELECT ?,$1,$where,$set,$null WHERE x=1",
    ],
    ["SELECT 数据===1", "SELECT 数据=1"],
    [
      "SELECT null_value,nullable,NULLS FROM t",
      "SELECT null_value,nullable,NULLS FROM t",
    ],
    ["SELECT * FROM t WHERE x = NULL", "SELECT * FROM t WHERE x  IS  NULL"],
    ["SELECT * FROM t WHERE x!=null", "SELECT * FROM t WHERE x IS NOT null"],
    ["SELECT * FROM t WHERE x!==NuLl", "SELECT * FROM t WHERE x IS NOT NuLl"],
    ["SELECT * FROM t WHERE x<>NULL", "SELECT * FROM t WHERE x<>NULL"],
    [
      "SELECT * FROM t WHERE x<=NULL OR x>=NULL",
      "SELECT * FROM t WHERE x<=NULL OR x>=NULL",
    ],
    [
      "UPDATE t SET x=null WHERE y==null",
      "UPDATE t SET x=null WHERE y IS null",
    ],
    [
      "UPDATE t SET x=null; SELECT y==null",
      "UPDATE t SET x=null; SELECT y IS null",
    ],
    ["SELECT x==/* == null */null", "SELECT x IS /* == null */null"],
    ["SELECT * FROM t WHERE a||b='ab'", "SELECT * FROM t WHERE a OR b='ab'"],
    [
      "SELECT * FROM t WHERE isActive||isAdmin",
      "SELECT * FROM t WHERE isActive OR isAdmin",
    ],
  ]
) {
  Deno.test(`cleanSQL exact output: ${JSON.stringify(input)}`, () => {
    assertEquals(cleanSQL(input), expected);
    assertEquals(cleanSQL(expected), expected);
  });
}

for (
  const [operator, normalized] of [["==", "="], ["===", "="], ["!==", "!="], [
    "&&",
    " AND ",
  ]]
) {
  for (const gap of ["", " ", "\t", "\n", "/**/"]) {
    Deno.test(`cleanSQL operator ${operator} separated by ${JSON.stringify(gap)}`, () => {
      const input = `SELECT 1${gap}${operator}${gap}1`;
      const expected = `SELECT 1${gap}${normalized}${gap}1`;
      assertEquals(cleanSQL(input), expected);
      assertEquals(cleanSQL(expected), expected);
    });
  }
}

// Compare actual DuckDB results against hand-written SQL, bypassing cleaning
// for the expected query so a normalization bug cannot affect both sides.
const semanticCases = [
  [
    "list concatenation",
    "([x=1] || [x=2]) = [true,false]",
    "([x=1] || [x=2]) = [true,false]",
  ],
  [
    "cast concatenation",
    "(x=1)::VARCHAR || '!' = 'true!'",
    "(x=1)::VARCHAR || '!' = 'true!'",
  ],
  [
    "nested CASE",
    "concat(CASE WHEN x=1 THEN CASE WHEN x==1 || x==2 THEN 'a' ELSE 'b' END ELSE 'c' END, '!') = 'a!'",
    "CASE WHEN x=1 THEN CASE WHEN x=1 OR x=2 THEN 'a' ELSE 'b' END ELSE 'c' END || '!' = 'a!'",
  ],
  ["OR comparisons", "x==1 || x===3", "x=1 OR x=3"],
  ["OR chain", "x==1 || x==2 || x==3", "x=1 OR x=2 OR x=3"],
  ["AND precedence", "x==1 || x==2 && x<2", "x=1 OR x=2 AND x<2"],
  [
    "nested predicates",
    "((x==1)&&(x<2)) || (x==3)",
    "((x=1) AND (x<2)) OR (x=3)",
  ],
  ["NOT predicates", "NOT(x==1) || x==3", "NOT(x=1) OR x=3"],
  ["BETWEEN on left", "x BETWEEN 1 AND 2 || x==3", "x BETWEEN 1 AND 2 OR x=3"],
  ["BETWEEN on right", "x==1 || x BETWEEN 2 AND 3", "x=1 OR x BETWEEN 2 AND 3"],
  [
    "NOT BETWEEN",
    "x NOT BETWEEN 1 AND 2 || x==1",
    "x NOT BETWEEN 1 AND 2 OR x=1",
  ],
  ["IN predicates", "x IN (1,2) || x==3", "x IN (1,2) OR x=3"],
  ["LIKE predicates", "s LIKE 'a%' || x==3", "s LIKE 'a%' OR x=3"],
  ["null comparisons", "x==null || x!==null", "x IS NULL OR x IS NOT NULL"],
  ["concatenation on left", "s || '!' = 'a!'", "s || '!' = 'a!'"],
  ["concatenation on right", "'a!' = s || '!'", "'a!' = s || '!'"],
  ["concat mixed with OR", "s || '!' = 'a!' || x==3", "s || '!' = 'a!' OR x=3"],
  [
    "CASE concatenation",
    "CASE WHEN x=1 THEN s ELSE 'b' END || '!' = 'a!'",
    "CASE WHEN x=1 THEN s ELSE 'b' END || '!' = 'a!'",
  ],
  [
    "CASE predicate",
    "CASE WHEN x=1 THEN 1 ELSE 0 END = 1 || x==3",
    "CASE WHEN x=1 THEN 1 ELSE 0 END = 1 OR x=3",
  ],
  [
    "boolean CASE concatenation",
    "CASE WHEN x=1 THEN true ELSE false END || '!' = 'true!'",
    "CASE WHEN x=1 THEN true ELSE false END || '!' = 'true!'",
  ],
  [
    "subquery projection",
    "EXISTS (SELECT concat(s, '!') WHERE x==1) || x==3",
    "EXISTS (SELECT s || '!' WHERE x=1) OR x=3",
  ],
  [
    "scalar subquery concatenation",
    "(SELECT 'a' || '!') = s || '!'",
    "(SELECT 'a' || '!') = s || '!'",
  ],
];
for (const [name, shorthand, sql] of semanticCases) {
  Deno.test(`cleanSQL DuckDB semantics: ${name}`, async () => {
    const sdb = new SimpleDB();
    try {
      const prefix =
        "SELECT x FROM (VALUES (1,'a'),(2,'b'),(3,'c'),(NULL,NULL)) t(x,s) WHERE ";
      const query = `${prefix}${shorthand} ORDER BY x NULLS LAST`;
      const options = mergeOptions(sdb, {
        table: null,
        method: null,
        parameters: null,
        returnData: true,
      });
      const expected = await queryDB(
        sdb,
        `${prefix}${sql} ORDER BY x NULLS LAST`,
        { ...options, noClean: true },
      );
      assertEquals(await queryDB(sdb, query, options), expected);
      assertEquals(cleanSQL(cleanSQL(query)), cleanSQL(query));
    } finally {
      await sdb.close();
    }
  });
}

Deno.test("cleanSQL keeps named parameters distinct from SQL keywords", () => {
  assertEquals(
    cleanSQL("SELECT * FROM t WHERE x=$set && y==null"),
    "SELECT * FROM t WHERE x=$set  AND  y IS null",
  );
  assertEquals(
    cleanSQL("SELECT $where || 'a' = 'b' || 'c' = 'd'"),
    "SELECT $where || 'a' = 'b'  OR  'c' = 'd'",
  );
});

const queryCases = [
  [
    "HAVING",
    "SELECT count(*) n FROM (VALUES (1),(2)) t(x) HAVING count(*)==2 || count(*)==0",
    "SELECT count(*) n FROM (VALUES (1),(2)) t(x) HAVING count(*)=2 OR count(*)=0",
  ],
  [
    "QUALIFY",
    "SELECT x, row_number() OVER () n FROM (VALUES (1),(2),(3)) t(x) QUALIFY n==1 || n==3",
    "SELECT x, row_number() OVER () n FROM (VALUES (1),(2),(3)) t(x) QUALIFY n=1 OR n=3",
  ],
  [
    "UNION boundary",
    "SELECT 'a' s WHERE 1==1 || 1==2 UNION ALL SELECT concat('b', 'c') s",
    "SELECT 'a' s WHERE 1=1 OR 1=2 UNION ALL SELECT concat('b', 'c') s",
  ],
  [
    "CTE",
    "WITH t AS (SELECT concat('a', 'b') s WHERE 1==1 || 1==2) SELECT s FROM t WHERE s=='ab'",
    "WITH t AS (SELECT concat('a', 'b') s WHERE 1=1 OR 1=2) SELECT s FROM t WHERE s='ab'",
  ],
  [
    "CASE condition",
    "SELECT CASE WHEN 1==2 || 2==2 THEN 'a' ELSE 'b' END s",
    "SELECT CASE WHEN 1=2 OR 2=2 THEN 'a' ELSE 'b' END s",
  ],
  [
    "CASE BETWEEN bound",
    "SELECT 1 x WHERE 1 BETWEEN CASE WHEN true AND false THEN 0 ELSE 1 END AND 2 || 1==2",
    "SELECT 1 x WHERE 1 BETWEEN CASE WHEN true AND false THEN 0 ELSE 1 END AND 2 OR 1=2",
  ],
  [
    "two BETWEEN predicates",
    "SELECT 1 x WHERE 1 BETWEEN 0 AND 2 || 2 BETWEEN 1 AND 3",
    "SELECT 1 x WHERE 1 BETWEEN 0 AND 2 OR 2 BETWEEN 1 AND 3",
  ],
  [
    "BETWEEN parenthesized bound",
    "SELECT 1 x WHERE 1 BETWEEN (SELECT 0 WHERE true AND true) AND 2 || 1==2",
    "SELECT 1 x WHERE 1 BETWEEN (SELECT 0 WHERE true AND true) AND 2 OR 1=2",
  ],
];
for (const [name, input, expected] of queryCases) {
  Deno.test(`cleanSQL whole query: ${name}`, async () => {
    const sdb = new SimpleDB();
    try {
      const options = mergeOptions(sdb, {
        table: null,
        method: null,
        parameters: null,
        returnData: true,
      });
      const expectedRows = await queryDB(sdb, expected, {
        ...options,
        noClean: true,
      });
      assertEquals(await queryDB(sdb, input, options), expectedRows);
      assertEquals(cleanSQL(cleanSQL(input)), cleanSQL(input));
    } finally {
      await sdb.close();
    }
  });
}

Deno.test("cleanSQL preserves varied literal payloads when executed", async () => {
  const sdb = new SimpleDB();
  try {
    const payloads = [
      "",
      "'",
      "''",
      "\\",
      "\\'",
      "\n\r\t",
      "数据 résumé",
      "WHERE SET SELECT null",
      "== === !== && ||",
      "-- /* nested */",
      "$tag$ $$",
      "a' OR TRUE --",
      '"quoted"',
      "(a == null); SELECT 2",
    ];
    const literals = payloads.flatMap((value) => [
      { value, sql: `'${value.replaceAll("'", "''")}'` },
      {
        value,
        sql: `E'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`,
      },
      { value, sql: `$payload$${value}$payload$` },
    ]);
    const options = mergeOptions(sdb, {
      table: null,
      method: null,
      parameters: null,
      returnData: true,
    });
    for (const { value, sql } of literals) {
      const query = `SELECT ${sql} AS value WHERE 1===1`;
      assertEquals(await queryDB(sdb, query, options), [{ value }], sql);
      assertEquals(cleanSQL(cleanSQL(query)), cleanSQL(query));
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("cleanSQL preserves UPDATE assignments and normalizes its WHERE", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("updates").loadArray([{ x: 1, s: "a" }, {
      x: 2,
      s: "b",
    }]);
    await table.run();
    await queryDB(
      sdb,
      "UPDATE updates SET s=null WHERE x==1 || x==3",
      mergeOptions(sdb, { table: null, method: null, parameters: null }),
    );
    assertEquals(await table.sort({ x: "asc" }).getData(), [{ x: 1, s: null }, {
      x: 2,
      s: "b",
    }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("cleanSQL normalizes every statement while preserving quoted semicolons", async () => {
  const sdb = new SimpleDB();
  try {
    const options = mergeOptions(sdb, {
      table: null,
      method: null,
      parameters: null,
    });
    await queryDB(
      sdb,
      "CREATE TABLE statements AS SELECT 1 x WHERE 1==1; INSERT INTO statements SELECT 2 WHERE 2==2 || 1==2; INSERT INTO statements SELECT 3 WHERE ';'==';'",
      options,
    );
    assertEquals(
      await queryDB(sdb, "SELECT x FROM statements ORDER BY x", {
        ...options,
        returnData: true,
      }),
      [{ x: 1 }, { x: 2 }, { x: 3 }],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("SQL mode is a byte-for-byte passthrough", () => {
  for (
    const sql of [
      "  SELECT true || false;\n",
      "SELECT null = null",
      "SELECT 1 === 1",
      "SELECT ? /* && */",
      "'unterminated",
      "SELECT [true] || [false]",
    ]
  ) {
    assertEquals(cleanSQL(sql, "sql"), sql);
  }
});

Deno.test("JS mode treats untyped logical operands as OR", () => {
  for (
    const expression of [
      "a||b",
      "check_a()||check_b()",
      "true||false",
      "(a=1)||(b=2)",
    ]
  ) {
    const query = `SELECT ${expression}`;
    assertEquals(cleanSQL(query, "js"), query.replace("||", " OR "));
  }
});

const obviousConcatenations = [
  "first || ' ' || last",
  "(first || ' ') || last",
  "first || (last || '!')",
  "(true::VARCHAR || '!') || last",
  "first || last || '!'",
  "'Hello ' || first || last",
  "'a' || 'b'",
  "$$a$$ || $tag$b$tag$",
  "first /* || */ || '!'",
  "('a') || first",
  "[true] || [false]",
  "CAST(true AS VARCHAR) || false",
  "true::VARCHAR || false",
  "concat('a', 'b') || first",
];
for (const expression of obviousConcatenations) {
  Deno.test(`JS mode preserves obvious concatenation: ${expression}`, () => {
    const query = `SELECT ${expression} FROM t`;
    assertEquals(cleanSQL(query), query);
    assertEquals(cleanSQL(cleanSQL(query)), query);
  });
}

for (
  const [input, expected] of [
    ["text='a' || text='b'", "text='a'  OR  text='b'"],
    ["text='a' || active", "text='a'  OR  active"],
    ["active || admin", "active  OR  admin"],
    ["is_active() || is_admin()", "is_active()  OR  is_admin()"],
    ["first || last", "first  OR  last"],
    [
      "CAST('true' AS BOOLEAN) || active",
      "CAST('true' AS BOOLEAN)  OR  active",
    ],
    ["'true'::BOOLEAN || active", "'true'::BOOLEAN  OR  active"],
    ["(first || '!')='a!' || active", "(first || '!')='a!'  OR  active"],
  ]
) {
  Deno.test(`JS mode keeps ambiguous or logical pipes as OR: ${input}`, () => {
    assertEquals(
      cleanSQL(`SELECT ${input} FROM t`),
      `SELECT ${expected} FROM t`,
    );
  });
}

Deno.test("JS mode does not mistake BETWEEN string bounds for concatenation", () => {
  assertEquals(
    cleanSQL("SELECT * FROM t WHERE text BETWEEN 'a' AND 'b' || active"),
    "SELECT * FROM t WHERE text BETWEEN 'a' AND 'b'  OR  active",
  );
  assertEquals(
    cleanSQL("SELECT * FROM t WHERE text BETWEEN 'a' AND 'b' || text='c'"),
    "SELECT * FROM t WHERE text BETWEEN 'a' AND 'b'  OR  text='c'",
  );
});
