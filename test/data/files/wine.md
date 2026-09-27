# Named wines and taste profiles

`wine.csv` contains all 2,000 rows from MrBridge's **Vivino Burgundy Wines 2026:
Ratings & Tastes** dataset, with nine selected columns. Acidity, intensity,
sweetness, and tannin are Vivino taste-profile scores, not laboratory
measurements. Their calculation and calibration are not documented in the
source.

## Source and license

- Creator: [MrBridge](https://mr-bridge.com).
- Dataset:
  [Vivino Burgundy Wines 2026: Ratings & Tastes](https://huggingface.co/datasets/Mr-Bridge/vivino-bourgogne-wines-2026).
- Source revision: `959c60f9431f1e25d857d18baec77ecb596b3a64`.
- [Pinned CSV](https://huggingface.co/datasets/Mr-Bridge/vivino-bourgogne-wines-2026/resolve/959c60f9431f1e25d857d18baec77ecb596b3a64/data.csv).
- [Source description and license](https://huggingface.co/datasets/Mr-Bridge/vivino-bourgogne-wines-2026/blob/959c60f9431f1e25d857d18baec77ecb596b3a64/README.md).

The source was collected from Vivino by MrBridge and is distributed under
[Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/).
This prepared CSV is an adaptation under the same CC BY-SA 4.0 license. The
repository's MIT license does not replace the dataset license. Retain
attribution, the license link, and these modification details when
redistributing the data.

## Preparation

Select these nine columns, retaining their original names, values, and row
order:

```text
fullName,wineType,regionName,acidity,intensity,sweetness,tannin,vintageYear,isNatural
```

The file contains 1,026 red, 941 white, 21 rosé, eight dessert, three sparkling,
and one fortified wine. No rows are removed, scores imputed, or names invented.
All red wines have complete finite acidity, intensity, sweetness, and tannin
scores. Other types have missing tannin; dessert and fortified wines also lack
all three other scores, and sparkling wines lack sweetness. Empty cells retain
missing values, which DuckDB reads as NULL. `vintageYear` is missing in 1,804
rows and is not used in the comparison. `isNatural` is read as BOOLEAN.

Names are copied as supplied, including a vintage when present. There are two
repeated names in the full file, belonging to distinct source wine IDs; both are
retained. Names are unique within the red-wine subset. Source wine IDs and URLs,
prices, ratings, and review text are omitted. Taste profiles must not be
interpreted as verified vintage-specific measurements.

To reproduce, save the pinned CSV as `data.csv` and run this Python script:

```python
import csv

columns = [
    "fullName", "wineType", "regionName", "acidity", "intensity",
    "sweetness", "tannin", "vintageYear", "isNatural",
]
with open("data.csv", encoding="utf-8", newline="") as source:
    rows = list(csv.DictReader(source))
assert len(rows) == 2000
with open("wine.csv", "w", encoding="utf-8", newline="") as output:
    writer = csv.DictWriter(output, fieldnames=columns, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({column: row[column] for column in columns})
```

Checksums (SHA-256):

- Original `data.csv`:
  `c0274c82b328d8a96621deb9a49a6abf45c77ffe29aa8be2bcd0952a56d36aaa`
- Prepared `wine.csv`:
  `d07e6ced9c351b378cc80d74cbb14fb6e9bd7badaf91e558f9dd7bf0677013fa`

## Similarity example

The example first filters to red wines with a tannin score, leaving 1,026 rows.
It retrieves **Louis Jadot Bourgogne Pinot Noir** by name and compares its
acidity, intensity, sweetness, and tannin with every remaining wine using
`similarityMahalanobis()`. The other five columns are metadata and do not enter
the calculation.

Covariance and similarity scores are calculated from all 1,026 red wines before
excluding the reference wine and selecting the five closest matches. The score
is `1 - distance / maxDistance`, relative to this subset; it is not a
probability or a prediction of personal enjoyment. The example logs names,
distances, and scores, rounded to three decimals.

The expected results in `test/unit/examples/wineSimilarity.test.ts` were
computed independently with NumPy 2.3.5 using the following calculation. NumPy
is only used for this reference calculation; the example and tests run with
Deno.

```python
import csv
import numpy as np

with open("test/data/files/wine.csv", encoding="utf-8", newline="") as source:
    rows = [r for r in csv.DictReader(source) if r["wineType"] == "Red" and r["tannin"] != ""]
features = ["acidity", "intensity", "sweetness", "tannin"]
x = np.array([[float(r[f]) for f in features] for r in rows])
reference = next(i for i, r in enumerate(rows) if r["fullName"] == "Louis Jadot Bourgogne Pinot Noir")
delta = x - x[reference]
covariance = np.cov(x, rowvar=False, ddof=1)
distances = np.sqrt(
    np.einsum("ij,ji->i", delta, np.linalg.solve(covariance, delta.T))
)
similarities = 1 - distances / distances.max()
nearest = sorted(
    (i for i in range(len(x)) if i != reference),
    key=lambda i: (distances[i], rows[i]["fullName"]),
)[:5]
print([(rows[i]["fullName"], distances[i], similarities[i]) for i in nearest])
```
