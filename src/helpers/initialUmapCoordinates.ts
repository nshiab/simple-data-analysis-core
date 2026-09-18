import umapRandom from "./umapRandom.ts";

export default function initialUmapCoordinates(count: number, seed: number) {
  const random = umapRandom(seed);
  return Float64Array.from({ length: count * 2 }, () => random() * 20 - 10);
}
