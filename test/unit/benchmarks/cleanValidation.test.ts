import { test } from "vite-plus/test";
import { assertRejects } from "../../helpers/assertions.ts";
import { mkdtemp as nodeMkdtemp, writeFile as nodeWriteFile, rm as nodeRm } from "node:fs/promises";
import { join as nodeJoin } from "node:path";
import { tmpdir as nodeTmpdir } from "node:os";

import assertEquivalentCleanOutputs from "../../../benchmarks/cleanValidation.ts";

test("cleaned benchmark outputs compare canonical values", async () => {
  const directory = await nodeMkdtemp(nodeJoin(nodeTmpdir(), "sda-test-"));
  const expected = `${directory}/expected.csv`;
  const equivalent = `${directory}/equivalent.csv`;
  try {
    await nodeWriteFile(
      expected,
      "time,station,station_name,tas,decade\n2020-01-01,1,Station,12.0,2020\n",
    );
    await nodeWriteFile(
      equivalent,
      "time,station,station_name,tas,decade\n2020-01-01,1,Station,12,2020\n",
    );
    await assertEquivalentCleanOutputs(expected, equivalent, "tidyverse");
  } finally {
    await nodeRm(directory, { recursive: true });
  }
});

test("cleaned benchmark outputs reject schema and value differences", async () => {
  const directory = await nodeMkdtemp(nodeJoin(nodeTmpdir(), "sda-test-"));
  const expected = `${directory}/expected.csv`;
  const different = `${directory}/different.csv`;
  try {
    await nodeWriteFile(
      expected,
      "time,station,station_name,tas,decade\n2020-01-01,1,Station,12,2020\n",
    );
    await nodeWriteFile(
      different,
      "time,station,station_name,tas,decade\n2020-01-01,1,Station,13,2020\n",
    );
    await assertRejects(
      () => assertEquivalentCleanOutputs(expected, different, "pandas"),
      Error,
      "1 row mismatches",
    );
    await nodeWriteFile(different, "time,station,station_name,tas\n2020-01-01,1,Station,12\n");
    await assertRejects(
      () => assertEquivalentCleanOutputs(expected, different, "pandas"),
      Error,
      "cleaned output columns must be",
    );
  } finally {
    await nodeRm(directory, { recursive: true });
  }
});
