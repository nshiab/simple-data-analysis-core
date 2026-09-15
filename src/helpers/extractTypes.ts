export default function extractTypes(
  types: {
    [key: string]: unknown;
  }[] | null,
) {
  const rows = (types ?? []) as {
    column_name: string;
    column_type: string;
  }[];
  // Define own properties so valid names such as __proto__ do not invoke
  // Object.prototype setters in Node.js.
  return Object.fromEntries(
    rows.filter((row) => row.column_name).map((
      row,
    ) => [row.column_name, row.column_type]),
  );
}
