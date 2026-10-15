// from https://github.com/simple-statistics/simple-statistics/blob/main/src/combinations.js

function getCombinations<T>(x: T[], k: 2): [T, T][];
function getCombinations<T>(x: T[], k: number): T[][];
function getCombinations<T>(x: T[], k: number): T[][] {
  let i;
  let subI;
  const combinationList: T[][] = [];
  let subsetCombinations;
  let next;

  for (i = 0; i < x.length; i++) {
    if (k === 1) {
      combinationList.push([x[i]]);
    } else {
      subsetCombinations = getCombinations(x.slice(i + 1, x.length), k - 1);
      for (subI = 0; subI < subsetCombinations.length; subI++) {
        next = subsetCombinations[subI];
        next.unshift(x[i]);
        combinationList.push(next);
      }
    }
  }
  return combinationList;
}

export default getCombinations;
