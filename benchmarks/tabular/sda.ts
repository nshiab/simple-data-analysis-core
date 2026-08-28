import { SimpleDB } from "../../src/index.ts";
import { requiredEnvironment } from "../environment.ts";

const input = requiredEnvironment("BENCHMARK_INPUT");
const cleanOutput = requiredEnvironment("BENCHMARK_CLEAN_OUTPUT");
const resultOutput = requiredEnvironment("BENCHMARK_RESULT_OUTPUT");
const sdb = new SimpleDB();

try {
  const temperatures = sdb.newTable("temperatures");
  temperatures
    .loadData(input, {
      allText: true,
      columns: ["time", "station", "station_name", "tas"],
    })
    .removeMissing({ columns: "tas" })
    .convert({ tas: "double", time: "date" })
    .addColumn("decade", "integer", "FLOOR(YEAR(time) / 10) * 10");
  await temperatures.writeData(cleanOutput);
  temperatures
    .summarize({
      columns: "tas",
      by: ["station", "station_name", "decade"],
      stats: "mean",
    })
    .sort({ station: "asc", station_name: "asc", decade: "asc" });
  await temperatures.writeData(resultOutput);
} finally {
  await sdb.close();
}
