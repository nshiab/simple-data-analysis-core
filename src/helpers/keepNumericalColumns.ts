export default function keepNumericalColumns(types: { [key: string]: string }) {
  const columns: string[] = [];
  for (const col of Object.keys(types)) {
    const type = types[col];
    if (
      ["FLOAT", "DOUBLE", "REAL"].includes(type) ||
      type.startsWith("DECIMAL") ||
      type.includes("INT")
    ) {
      columns.push(col);
    }
  }
  return columns;
}
