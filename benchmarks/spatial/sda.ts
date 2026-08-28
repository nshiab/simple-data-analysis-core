import { SimpleDB } from "../../src/index.ts";
import { requiredEnvironment } from "../environment.ts";

const treesInput = requiredEnvironment("BENCHMARK_INPUT");
const neighbourhoodsInput = requiredEnvironment("BENCHMARK_POLYGONS");
const resultOutput = requiredEnvironment("BENCHMARK_RESULT_OUTPUT");
const sdb = new SimpleDB();

try {
  const trees = sdb.newTable("trees");
  trees
    .loadData(treesInput, {
      columns: ["Latitude", "Longitude"],
      ignoreErrors: true,
    })
    .removeMissing({ columns: ["Latitude", "Longitude"] })
    .createPoints("Latitude", "Longitude", "geom")
    .selectColumns("geom");

  const neighbourhoods = sdb.newTable("neighbourhoods");
  neighbourhoods.loadGeoData(neighbourhoodsInput, {
    columns: ["nom_qr", "geom"],
  });

  const joined = trees.joinGeo(neighbourhoods, "inside", {
    type: "inner",
    outputTable: "joined",
    excludeLeftGeometry: true,
    excludeRightGeometry: true,
  });
  joined
    .summarize({ by: "nom_qr", stats: "count" })
    .sort({ nom_qr: "asc" });
  await joined.writeData(resultOutput);
} finally {
  await sdb.close();
}
