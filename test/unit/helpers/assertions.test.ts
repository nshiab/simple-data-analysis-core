import { expect, test } from "vite-plus/test";
import { assertRejects } from "../../helpers/assertions.ts";

test("assertRejects returns the rejected error after checking its class and message", async () => {
  const error = new TypeError("Expected rejection detail");
  expect(await assertRejects(() => Promise.reject(error), TypeError, "rejection detail")).toBe(
    error,
  );
});

test("assertRejects fails when the callback throws before returning a promise", async () => {
  const error = new Error("Synchronous callback failure");
  await expect(
    assertRejects(() => {
      throw error;
    }),
  ).rejects.toBe(error);
});

test("assertRejects fails when the returned promise fulfills", async () => {
  await expect(assertRejects(() => Promise.resolve())).rejects.toThrow(
    "Expected the function to reject.",
  );
});

test("assertRejects fails when the rejected error has the wrong class or message", async () => {
  const error = new TypeError("Actual rejection detail");
  await expect(assertRejects(() => Promise.reject(error), RangeError)).rejects.toThrow();
  await expect(
    assertRejects(() => Promise.reject(error), TypeError, "missing detail"),
  ).rejects.toThrow();
});
