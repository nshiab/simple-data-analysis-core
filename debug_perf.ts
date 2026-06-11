import SimpleDB from "./src/class/SimpleDB.ts";

const sdb = new SimpleDB();
await sdb.customQuery(`INSTALL spatial; LOAD spatial;`);

await sdb.customQuery(`
    CREATE OR REPLACE TABLE test_perf AS 
    SELECT ST_GeomFromText('POINT(' || i || ' ' || i || ')') as geom 
    FROM range(100) t(i)
`);

console.log("Current query EXPLAIN:");
const plan = await sdb.customQuery(
  `
    EXPLAIN SELECT 
        CASE WHEN ST_IsEmpty(ST_Union_Agg(geom)) THEN NULL ELSE ST_Union_Agg(geom) END AS geom 
    FROM test_perf
`,
  { returnDataFrom: "query" },
);

console.log(plan?.[0]?.explanation || plan);

await sdb.done();
