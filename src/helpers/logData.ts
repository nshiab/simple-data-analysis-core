import LogValue from "./LogValue.ts";
import printTable from "./printTable.ts";

export default function logData(
  types: { [key: string]: string } | null,
  data: { [key: string]: unknown }[] | null,
  charsToLog?: number,
) {
  if (data === null) {
    console.log("Data is null");
    return;
  }
  if (data.length === 0) {
    console.log(data);
    return;
  }
  const formatted = data.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => {
        const nested = value !== null && typeof value === "object" &&
          !(value instanceof Date) && !(value instanceof LogValue);
        let text = value instanceof LogValue
          ? value.text
          : nested
          ? JSON.stringify(value)
          : value;
        const truncatable = !(value instanceof LogValue) ||
          value.category === "string";
        if (
          truncatable && typeof text === "string" &&
          typeof charsToLog === "number" && text.length > charsToLog
        ) {
          const limit = Math.max(0, Math.floor(charsToLog));
          text = text.slice(0, Math.max(0, limit - 3)) + "...".slice(0, limit);
        }
        return [
          key,
          value instanceof LogValue
            ? new LogValue(
              String(text),
              value.jsType,
              value.category,
            )
            : text,
        ];
      }),
    )
  );
  const hasTypes = types !== null && Object.keys(types).length > 0;
  if (hasTypes) {
    formatted.unshift(
      Object.fromEntries(
        Object.entries(types).map(([key, sqlType]) => {
          const representations = new Set(data.flatMap((row) => {
            const value = row[key];
            if (value instanceof LogValue) {
              return value.category === "null" ? [] : [value.jsType];
            }
            return value === null || value === undefined ? [] : [typeof value];
          }));
          const first = data[0][key];
          const representation = representations.size > 0
            ? [...representations].join("|")
            : first instanceof LogValue
            ? first.jsType
            : "null";
          return [key, `${sqlType}/${representation}`];
        }),
      ),
    );
  }
  printTable(formatted, hasTypes ? { typesRowIndex: 0 } : undefined);
}
