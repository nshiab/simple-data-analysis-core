export default function padQuery(
  table: string,
  columns: string[],
  length: number,
  options: { side?: "start" | "end"; char?: string },
) {
  const side = options.side ?? "start";
  const char = options.char ?? "0";

  // Wrap the padding character in single quotes for SQL
  const paddedChar = `'${char}'`;
  const func = side === "start" ? "LPAD" : "RPAD";

  let query = "";
  for (const column of columns) {
    query +=
      `\nUPDATE "${table}" SET "${column}" = ${func}("${column}", ${length}, ${paddedChar});`;
  }

  return query;
}
