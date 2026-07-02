import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function outliersIQR(
  simpleTable: SimpleTable,
  column: string,
  newColumn: string,
  options: {
    categories?: string | string[];
  } = {},
) {
  await queryDB(
    simpleTable,
    outliersIQRQuery(
      simpleTable.name,
      column,
      newColumn,
      (await simpleTable.getNbRows()) % 2 === 0 ? "even" : "odd",
      options,
    ),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "outliersIQR()",
      parameters: { column, newColumn, options },
    }),
  );
}

function outliersIQRQuery(
  table: string,
  column: string,
  newColumn: string,
  parity: "even" | "odd",
  options: {
    categories?: string | string[];
  } = {},
) {
  const categories = options.categories
    ? stringToArray(options.categories).map((d) => `"${d}"`)
    : [];

  const quantileFunc = parity === "even" ? "quantile_disc" : "quantile_cont";

  const where = categories.length > 0
    ? `WHERE ${
      categories
        .map((d) => `"${table}".${d} = "iqr".${d}`)
        .join(" AND ")
    }`
    : "";

  const query = `ALTER TABLE "${table}"
    ADD COLUMN "${newColumn}" BOOLEAN;
    WITH "iqr" AS (
        SELECT${categories.length > 0 ? `\n${categories.join(", ")},` : ""}
            ${quantileFunc}("${column}", 0.25) as "q1",
            ${quantileFunc}("${column}", 0.75) as "q3",
            ("q3"-"q1")*1.5 as "range",
            "q1"-"range" as "lowThreshold",
            "q3"+"range" as "highThreshold"
        FROM "${table}"
        ${categories.length > 0 ? `GROUP BY ${categories.join(", ")}` : ""}
    )
    UPDATE "${table}"
    SET "${newColumn}" = CASE
        WHEN "${column}" > (SELECT "highThreshold" FROM "iqr" ${where}) OR "${column}" < (SELECT "lowThreshold" FROM "iqr" ${where}) THEN TRUE
        ELSE FALSE
    END;
    `;

  return query;
}
