# Wine recognition dataset

`wine.csv` contains all 178 rows and 13 chemical measurements from the UCI Wine
dataset, representing wines from one Italian region and three cultivars. The
original class codes `1`, `2`, and `3` are retained as `cultivar`; cultivar
names are not provided. There are 59, 71, and 48 samples respectively.

## Source and license

Aeberhard, S. & Forina, M. (1992). Wine [Dataset]. UCI Machine Learning
Repository. <https://doi.org/10.24432/C5PC7J>.

- Dataset: <https://archive.ics.uci.edu/dataset/109/wine>
- Download: <https://archive.ics.uci.edu/static/public/109/wine.zip>
- License:
  [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

The dataset retains its CC BY 4.0 license; the repository's MIT license does not
replace it. Attribution and modification details should accompany
redistribution.

## Preparation

Extract `wine.data` from the UCI archive, prepend this header, and insert a
one-based `sampleId` following the original row order. These IDs are local
labels, not identifiers supplied by UCI. Preserve the existing class and
measurement values, their numeric text, and row order. The source has no missing
values; no rows were removed and no measurements were imputed or normalized.

```text
sampleId,cultivar,alcohol,malicAcid,ash,ashAlkalinity,magnesium,totalPhenols,flavanoids,nonflavanoidPhenols,proanthocyanins,colorIntensity,hue,od280Od315,proline
```

Measurement columns follow UCI's original feature order. `ashAlkalinity`
represents "Alcalinity of ash" and `od280Od315` represents "OD280/OD315 of
diluted wines".

Checksums (SHA-256):

- Original `wine.data`:
  `6be6b1203f3d51df0b553a70e57b8a723cd405683958204f96d23d7cd6aea659`
- Prepared `wine.csv`:
  `213dfb3e1e0ec94d0802f259fc586c78c5714eab01c4a2b6f554e1bc1a045762`

## Similarity example

The example uses sample 100 as a reference and `mahalanobis()` to compare all 13
chemical measurements. `sampleId` and `cultivar` are excluded from the features.
Sample covariance is estimated from all 178 rows before excluding the reference
and selecting its ten closest matches. Smaller distances indicate closer
chemical profiles, not taste similarity or wine quality.

The expected results in `test/unit/examples/wineSimilarity.test.ts` were
computed independently with NumPy 2.3.5 using the following calculation. NumPy
is only used to document the reference calculation; the example and tests run
with Deno.

```python
import numpy as np

data = np.loadtxt("test/data/files/wine.csv", delimiter=",", skiprows=1)
x = data[:, 2:]
delta = x - x[99]
covariance = np.cov(x, rowvar=False, ddof=1)
distances = np.sqrt(
    np.einsum("ij,ji->i", delta, np.linalg.solve(covariance, delta.T))
)
nearest = sorted(
    (i for i in range(len(x)) if i != 99),
    key=lambda i: (distances[i], i),
)[:10]
print([(i + 1, distances[i]) for i in nearest])
```
