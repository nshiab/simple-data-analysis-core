export default function padQuery(
  table: string,
  columns: string[],
  length: number,
  options: { method?: "left" | "right"; char?: string },
) {
  const method = options.method ?? "left";
  const char = options.char ?? "0";

  // Escape single quotes and wrap in single quotes for SQL
  const escapedChar = char.replace(/'/g, "''");
  const paddedChar = `'${escapedChar}'`;
  const func = method === "left" ? "LPAD" : "RPAD";

  let query = "";
  for (const column of columns) {
    query +=
      `\nUPDATE "${table}" SET "${column}" = ${func}("${column}", ${length}, ${paddedChar});`;
  }

  return query;
}
