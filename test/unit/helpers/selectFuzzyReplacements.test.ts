import { assertEquals } from "@std/assert";
import selectFuzzyReplacements, {
  type FuzzyPair,
  type FuzzyStrategy,
} from "../../../src/helpers/selectFuzzyReplacements.ts";

const strategies: FuzzyStrategy[] = [
  "mostCommon",
  "longestString",
  "shortestString",
  "mostCentral",
  "maxScore",
];

// Independent breadth-first reference: find each component, then evaluate each
// member's incident edges. This deliberately favors clarity over performance.
function reference(pairs: FuzzyPair[], strategy: FuzzyStrategy) {
  const counts = new Map<string, number>();
  const neighbors = new Map<string, Set<string>>();
  for (const pair of pairs) {
    counts.set(pair.left_value, pair.left_cnt);
    counts.set(pair.right_value, pair.right_cnt);
    for (
      const [a, b] of [[pair.left_value, pair.right_value], [
        pair.right_value,
        pair.left_value,
      ]]
    ) {
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      neighbors.get(a)!.add(b);
    }
  }
  const unseen = new Set(counts.keys());
  const replacements = new Map<string, string>();
  while (unseen.size) {
    const members = [unseen.values().next().value!];
    unseen.delete(members[0]);
    for (let i = 0; i < members.length; i++) {
      for (const neighbor of neighbors.get(members[i])!) {
        if (unseen.delete(neighbor)) members.push(neighbor);
      }
    }
    const ranked = members.map((value) => {
      const scores = pairs.filter((p) =>
        p.left_value === value || p.right_value === value
      ).map((p) => p.score);
      const sum = scores.reduce((a, b) => a + b, 0);
      const primary = strategy === "mostCommon"
        ? counts.get(value)!
        : strategy === "longestString"
        ? value.length
        : strategy === "shortestString"
        ? -value.length
        : strategy === "maxScore"
        ? Math.max(...scores)
        : sum;
      return { value, primary, sum };
    }).sort((a, b) =>
      b.primary - a.primary || b.sum - a.sum ||
      (a.value < b.value ? -1 : a.value > b.value ? 1 : 0)
    );
    for (const value of members) {
      if (value !== ranked[0].value) replacements.set(value, ranked[0].value);
    }
  }
  return replacements;
}

Deno.test("selectFuzzyReplacements preserves transitive clusters and score tie-breaks", () => {
  const pairs: FuzzyPair[] = [
    {
      left_value: "A",
      right_value: "BB",
      left_cnt: 4,
      right_cnt: 4,
      score: 95,
    },
    {
      left_value: "BB",
      right_value: "CC",
      left_cnt: 4,
      right_cnt: 4,
      score: 90,
    },
    {
      left_value: "x",
      right_value: "yy",
      left_cnt: 2,
      right_cnt: 3,
      score: 99,
    },
    {
      left_value: "yy",
      right_value: "zz",
      left_cnt: 3,
      right_cnt: 3,
      score: 99,
    },
  ];
  for (const strategy of strategies) {
    assertEquals(
      selectFuzzyReplacements(pairs, strategy),
      reference(pairs, strategy),
    );
  }
  assertEquals(
    selectFuzzyReplacements(pairs, "mostCentral"),
    new Map([
      ["A", "BB"],
      ["CC", "BB"],
      ["x", "yy"],
      ["zz", "yy"],
    ]),
  );
});

Deno.test("selectFuzzyReplacements agrees with a graph reference across all strategies", () => {
  let state = 179;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const names = [
    "a",
    "bb",
    "cc",
    "ddd",
    "é",
    "😀",
    "\uE000",
    "zz",
    "long name",
    "O'Connor",
  ];
  for (let run = 0; run < 120; run++) {
    const counts = names.map(() => 1 + Math.floor(random() * 3));
    const pairs: FuzzyPair[] = [];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        if (random() < (run % 3 === 0 ? 0.7 : 0.12)) {
          pairs.push({
            left_value: names[i],
            right_value: names[j],
            left_cnt: counts[i],
            right_cnt: counts[j],
            score: 80 + Math.floor(random() * 5) / 3,
          });
        }
      }
    }
    for (const strategy of strategies) {
      assertEquals(
        selectFuzzyReplacements(pairs, strategy),
        reference(pairs, strategy),
        `run ${run}, ${strategy}`,
      );
      const reversed = [...pairs].reverse();
      assertEquals(
        selectFuzzyReplacements(reversed, strategy),
        reference(reversed, strategy),
      );
    }
  }
});
