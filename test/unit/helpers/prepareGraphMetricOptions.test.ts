import { test, expect } from "vite-plus/test";
import { assertThrows } from "../../helpers/assertions.ts";

import prepareGraphMetricOptions from "../../../src/helpers/prepareGraphMetricOptions.ts";

test("graph metric selection requires an explicit objective only when ambiguous", () => {
  const timed = {
    elapsedTime: true,
    startTimeColumn: "departure",
    endTimeColumn: "arrival",
  };
  expect(prepareGraphMetricOptions({}, "shortestPath()", true)).toStrictEqual({
    elapsedTime: false,
    minimize: "steps",
  });
  expect(prepareGraphMetricOptions({ weight: "price" }, "shortestPath()", true)).toStrictEqual({
    elapsedTime: false,
    minimize: "weight",
  });
  expect(prepareGraphMetricOptions(timed, "shortestPath()", true)).toStrictEqual({
    elapsedTime: true,
    minimize: "elapsedTime",
  });
  assertThrows(
    () => prepareGraphMetricOptions({ ...timed, weight: "price" }, "shortestPath()", true),
    TypeError,
    "when weight and elapsedTime are both enabled",
  );
  for (const minimize of ["steps", "weight", "elapsedTime"] as const) {
    expect(
      prepareGraphMetricOptions({ ...timed, weight: "price", minimize }, "shortestPath()", true),
    ).toStrictEqual({
      elapsedTime: true,
      minimize,
    });
  }
  expect(
    prepareGraphMetricOptions({ ...timed, weight: "price" }, "paths()", false).elapsedTime,
  ).toStrictEqual(true);
  assertThrows(
    () => prepareGraphMetricOptions({ ...timed, minimize: "elapsedTime" }, "paths()", false),
    TypeError,
    "returns all routes",
  );
});

test("graph metric selection rejects disabled or incomplete metrics", () => {
  for (const options of [
    { elapsedTime: true },
    { elapsedTime: true, startTimeColumn: "departure" },
    { elapsedTime: true, endTimeColumn: "arrival" },
  ]) {
    assertThrows(
      () => prepareGraphMetricOptions(options, "distances()", true),
      TypeError,
      "requires both",
    );
  }
  assertThrows(
    () => prepareGraphMetricOptions({ minimize: "weight" }, "distances()", true),
    TypeError,
    "requires options.weight",
  );
  assertThrows(
    () =>
      prepareGraphMetricOptions(
        { elapsedTime: false, minimize: "elapsedTime" },
        "distances()",
        true,
      ),
    TypeError,
    "requires options.elapsedTime: true",
  );
  assertThrows(
    () =>
      prepareGraphMetricOptions({ elapsedTime: "yes" as unknown as boolean }, "distances()", true),
    TypeError,
    "must be a boolean",
  );
  assertThrows(
    () => prepareGraphMetricOptions({ minimize: "price" as "weight" }, "distances()", true),
    TypeError,
    'must be "steps", "weight", or "elapsedTime"',
  );
  expect(
    prepareGraphMetricOptions({ elapsedTime: false, weight: "price" }, "distances()", true),
  ).toStrictEqual({
    elapsedTime: false,
    minimize: "weight",
  });
});
