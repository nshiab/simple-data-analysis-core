export type FuzzyPair = {
  left_value: string;
  right_value: string;
  left_cnt: number;
  right_cnt: number;
  score: number;
};

export type FuzzyStrategy =
  | "mostCommon"
  | "longestString"
  | "shortestString"
  | "mostCentral"
  | "maxScore";

/** Groups matching values transitively and chooses each component's canonical value. */
export default function selectFuzzyReplacements(
  pairs: FuzzyPair[],
  strategy: FuzzyStrategy,
): Map<string, string> {
  // Build count map from the pairs — no separate query needed.
  const countMap = new Map<string, number>();
  for (const { left_value, left_cnt, right_value, right_cnt } of pairs) {
    countMap.set(left_value, Number(left_cnt));
    countMap.set(right_value, Number(right_cnt));
  }

  // Union-Find — only over values that actually participate in a pair.
  const parent = new Map<string, string>();

  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  };

  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const v of countMap.keys()) find(v);
  for (const { left_value, right_value } of pairs) {
    union(left_value, right_value);
  }

  // Group values by their cluster root.
  const clusters = new Map<string, string[]>();
  for (const v of countMap.keys()) {
    const root = find(v);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(v);
  }

  // Pick the canonical value for each cluster.
  const replacement = new Map<string, string>();

  // Every pair belongs to exactly one component. Accumulate scores globally,
  // at most once, instead of scanning all pairs separately for each cluster.
  // Keep this lazy: distinct counts/lengths can choose a winner without scores.
  // Iterating in the original pair order also preserves floating-point ties.
  let scoreSum: Map<string, number> | null = null;
  const getScoreSum = (): Map<string, number> => {
    if (scoreSum === null) {
      scoreSum = new Map();
      for (const { left_value, right_value, score } of pairs) {
        scoreSum.set(left_value, (scoreSum.get(left_value) ?? 0) + score);
        scoreSum.set(right_value, (scoreSum.get(right_value) ?? 0) + score);
      }
    }
    return scoreSum;
  };

  let scoreMax: Map<string, number> | null = null;
  const getScoreMax = (): Map<string, number> => {
    if (scoreMax === null) {
      scoreMax = new Map();
      for (const { left_value, right_value, score } of pairs) {
        scoreMax.set(
          left_value,
          Math.max(scoreMax.get(left_value) ?? 0, score),
        );
        scoreMax.set(
          right_value,
          Math.max(scoreMax.get(right_value) ?? 0, score),
        );
      }
    }
    return scoreMax;
  };

  for (const members of clusters.values()) {
    if (members.length === 1) continue;

    // Sum-based comparator: highest total similarity, then alphabetical.
    const byScore = (a: string, b: string): string => {
      const sum = getScoreSum();
      const sa = sum.get(a) ?? 0;
      const sb = sum.get(b) ?? 0;
      if (sa !== sb) return sa > sb ? a : b;
      return a <= b ? a : b; // alphabetical tie-break
    };

    // Max-based comparator: highest single-pair score, then sum, then alphabetical.
    const byMaxScore = (a: string, b: string): string => {
      const mx = getScoreMax();
      const ma = mx.get(a) ?? 0;
      const mb = mx.get(b) ?? 0;
      if (ma !== mb) return ma > mb ? a : b;
      return byScore(a, b); // sum then alphabetical tie-break
    };

    let canonical: string;
    if (strategy === "longestString") {
      canonical = members.reduce((a, b) => {
        if (a.length !== b.length) return a.length > b.length ? a : b;
        return byScore(a, b);
      });
    } else if (strategy === "shortestString") {
      canonical = members.reduce((a, b) => {
        if (a.length !== b.length) return a.length < b.length ? a : b;
        return byScore(a, b);
      });
    } else if (strategy === "mostCommon") {
      canonical = members.reduce((a, b) => {
        const ca = countMap.get(a) ?? 0;
        const cb = countMap.get(b) ?? 0;
        if (ca !== cb) return ca > cb ? a : b;
        return byScore(a, b);
      });
    } else if (strategy === "mostCentral") {
      // Most central string — highest total similarity to all other cluster members.
      canonical = members.reduce((a, b) => byScore(a, b));
    } else {
      // "maxScore": the string participating in the single highest-scoring pair.
      canonical = members.reduce((a, b) => byMaxScore(a, b));
    }

    for (const m of members) {
      if (m !== canonical) replacement.set(m, canonical);
    }
  }

  return replacement;
}
