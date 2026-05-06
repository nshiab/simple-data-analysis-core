export default function padQuery(
  table: string,
  columns: string[],
  options: { length: number; method: "left" | "right"; character: string },
) {
  let query = ``;

  const method = options.method;
  const length = options.length;
  const character = options.character.replace(/'/g, "''");

  for (const column of columns) {
    const sqlMethod = method === "left" ? "LPAD" : "RPAD";
    query +=
      `\nUPDATE "${table}" SET "${column}" = ${sqlMethod}("${column}", ${length}, '${character}');`;
  }

  return query;
}
