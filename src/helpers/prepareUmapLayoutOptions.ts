import fitUmapCurve from "./fitUmapCurve.ts";

// Resolve and validate settings before database work, fitting the curve once.
export default function prepareUmapLayoutOptions(
  options: {
    epochs?: number;
    seed?: number;
    minDistance?: number;
    learningRate?: number;
    negativeSamples?: number;
  } = {},
) {
  const {
    epochs = 200,
    seed = 42,
    minDistance = 0.1,
    learningRate = 1,
    negativeSamples = 5,
  } = options;
  for (const [key, value] of Object.entries({ epochs, negativeSamples })) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${key} must be a positive safe integer.`);
    }
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error("seed must be an integer between 0 and 4294967295.");
  }
  if (!Number.isFinite(learningRate) || learningRate <= 0) {
    throw new Error("learningRate must be finite and positive.");
  }
  return {
    epochs,
    seed,
    learningRate,
    negativeSamples,
    curve: fitUmapCurve(minDistance),
  };
}
