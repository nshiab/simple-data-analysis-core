import { test, expect } from "vite-plus/test";

import dataToArrays from "../../../src/helpers/dataToArrays.ts";

test("dataToArrays - should return an object made of arrays", () => {
  const rawData = [
    { keyA: "a", keyB: 1 },
    { keyA: "b", keyB: 2 },
    { keyA: "c", keyB: 3 },
  ];
  const data = dataToArrays(rawData);

  expect(data).toStrictEqual({
    keyA: ["a", "b", "c"],
    keyB: [1, 2, 3],
  });
});
