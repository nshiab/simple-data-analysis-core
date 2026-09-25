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

The example defines a custom wine profile and uses `mahalanobis()` to compare
all 13 chemical measurements. `sampleId` and `cultivar` are excluded from the
features. Sample covariance is estimated from all 178 source rows before the
custom wine is inserted. The ten closest matches are selected without removing
any dataset wines from the table.

For visualization, the custom profile is inserted with `sampleId: 0` and no
cultivar. All 179 profiles are converted to vectors, each dimension is scaled to
[0, 1], and UMAP projects them into two dimensions with seed 42. The test checks
that this preserves measurements and similarity scores and produces finite
coordinates. The layout uses Euclidean distance on scaled measurements; visual
proximity is not the Mahalanobis ranking. Smaller Mahalanobis distances indicate
closer chemical profiles, not taste similarity or wine quality.

The expected results in `test/unit/examples/wineSimilarity.test.ts` were
computed independently with NumPy 2.3.5 using the following calculation. NumPy
is only used to document the reference calculation; the example and tests run
with Deno.

```python
import numpy as np

data = np.loadtxt("test/data/files/wine.csv", delimiter=",", skiprows=1)
x = data[:, 2:]
our_wine = np.array([12.5, 1.8, 2.2, 20, 95, 2.3, 2.1, 0.35, 1.6, 3.5, 1.05, 2.8, 600])
delta = x - our_wine
covariance = np.cov(x, rowvar=False, ddof=1)
distances = np.sqrt(
    np.einsum("ij,ji->i", delta, np.linalg.solve(covariance, delta.T))
)
nearest = sorted(
    range(len(x)),
    key=lambda i: (distances[i], i),
)[:10]
print([(i + 1, distances[i]) for i in nearest])
```
