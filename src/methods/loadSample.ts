import type SimpleTable from "../class/SimpleTable.ts";

/**
 * Fetches sample data from the simple-data-analysis-core GitHub repository.
 *
 * @param table - The SimpleTable instance to load the data into.
 * @param sample - The name of the sample to load.
 */
export default function loadSample(
  table: SimpleTable,
  sample:
    | "fires"
    | "recipes"
    | "temperatures"
    | "temperaturesCities"
    | "canada"
    | "firesGeo",
): SimpleTable {
  const samples = {
    fires: {
      url:
        "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/refs/heads/main/test/geodata/files/firesCanada2023.csv",
      geo: false,
    },
    recipes: {
      url:
        "https://github.com/nshiab/simple-data-analysis-core/raw/refs/heads/main/test/data/files/recipes.parquet",
      geo: false,
    },
    temperatures: {
      url:
        "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/refs/heads/main/test/data/files/dailyTemperatures.csv",
      geo: false,
    },
    temperaturesCities: {
      url:
        "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/refs/heads/main/test/data/files/cities.csv",
      geo: false,
    },
    canada: {
      url:
        "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/refs/heads/main/test/geodata/files/CanadianProvincesAndTerritories.json",
      geo: true,
    },
    firesGeo: {
      url:
        "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/refs/heads/main/test/geodata/files/firesCanada2023.geojson",
      geo: true,
    },
  };

  const sampleToLoad = samples[sample];

  // This validation doesn't need the database, so it stays at call time.
  if (!sampleToLoad) {
    throw new Error(
      `loadSample() does not recognize sample ${
        JSON.stringify(sample)
      }. Available samples: ${
        Object.keys(samples).map((name) => JSON.stringify(name)).join(", ")
      }.`,
    );
  }

  if (sampleToLoad.geo) {
    return table.loadGeoData(sampleToLoad.url);
  } else {
    return table.loadData(sampleToLoad.url);
  }
}
