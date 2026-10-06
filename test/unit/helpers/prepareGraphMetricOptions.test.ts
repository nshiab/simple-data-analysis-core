import { assertEquals, assertThrows } from "@std/assert";
import prepareGraphMetricOptions from "../../../src/helpers/prepareGraphMetricOptions.ts";

Deno.test("graph metric selection requires an explicit objective only when ambiguous", () => {
  const timed = {
    elapsedTime: true,
    startTimeColumn: "departure",
    endTimeColumn: "arrival",
  };
  assertEquals(prepareGraphMetricOptions({}, "shortestPath()", true), {
    elapsedTime: false,
    minimize: "connections",
  });
  assertEquals(
    prepareGraphMetricOptions({ weight: "price" }, "shortestPath()", true),
    {
      elapsedTime: false,
      minimize: "weight",
    },
  );
  assertEquals(prepareGraphMetricOptions(timed, "shortestPath()", true), {
    elapsedTime: true,
    minimize: "elapsedTime",
  });
  assertThrows(
    () =>
      prepareGraphMetricOptions(
        { ...timed, weight: "price" },
        "shortestPath()",
        true,
      ),
    TypeError,
    "when weight and elapsedTime are both enabled",
  );
  for (const minimize of ["weight", "elapsedTime"] as const) {
    assertEquals(
      prepareGraphMetricOptions(
        { ...timed, weight: "price", minimize },
        "shortestPath()",
        true,
      ),
      {
        elapsedTime: true,
        minimize,
      },
    );
  }
  assertEquals(
    prepareGraphMetricOptions({ ...timed, weight: "price" }, "paths()", false)
      .elapsedTime,
    true,
  );
  assertThrows(
    () =>
      prepareGraphMetricOptions(
        { ...timed, minimize: "elapsedTime" },
        "paths()",
        false,
      ),
    TypeError,
    "returns all routes",
  );
});

Deno.test("graph metric selection rejects disabled or incomplete metrics", () => {
  for (
    const options of [
      { elapsedTime: true },
      { elapsedTime: true, startTimeColumn: "departure" },
      { elapsedTime: true, endTimeColumn: "arrival" },
    ]
  ) {
    assertThrows(
      () => prepareGraphMetricOptions(options, "distances()", true),
      TypeError,
      "requires both",
    );
  }
  assertThrows(
    () =>
      prepareGraphMetricOptions({ minimize: "weight" }, "distances()", true),
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
      prepareGraphMetricOptions(
        { elapsedTime: "yes" as unknown as boolean },
        "distances()",
        true,
      ),
    TypeError,
    "must be a boolean",
  );
  assertThrows(
    () =>
      prepareGraphMetricOptions(
        { minimize: "price" as "weight" },
        "distances()",
        true,
      ),
    TypeError,
    'must be "weight" or "elapsedTime"',
  );
  assertEquals(
    prepareGraphMetricOptions(
      { elapsedTime: false, weight: "price" },
      "distances()",
      true,
    ),
    {
      elapsedTime: false,
      minimize: "weight",
    },
  );
});
