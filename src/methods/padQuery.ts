export default function padQuery(
  table: string,
  column: string,
  length: number,
  options: { side?: "start" | "end"; char?: string },
) {
  const side = options.side ?? "start";
  const char = options.char ?? "0";

  // Wrap the padding character in single quotes for SQL
  const paddedChar = `'${char}'`;

  if (side === "start") {
    return `UPDATE "${table}" SET "${column}" = LPAD("${column}", ${length}, ${paddedChar});`;
  } else {
    return `UPDATE "${table}" SET "${column}" = RPAD("${column}", ${length}, ${paddedChar});`;
  }
}
