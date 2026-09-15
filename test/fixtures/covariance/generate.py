"""Regenerate numpy-2.3.4.json with CPython 3.14.7 and NumPy 2.3.4."""

import json
import numpy as np

data = np.array(
    [
        [2.1, 8.0, 0.3],
        [2.5, 12.0, -0.1],
        [4.0, 14.0, 0.7],
        [3.6, 10.0, 0.2],
        [4.5, 18.0, 1.1],
        [5.1, 20.0, 0.9],
    ],
    dtype=np.float64,
)
mean = data.mean(axis=0)
covariance = np.cov(data, rowvar=False, ddof=1)
right_hand_side = np.array([1.25, -2.0, 0.5])
centered = data - mean
distances = np.sqrt(
    np.einsum("ij,jk,ik->i", centered, np.linalg.inv(covariance), centered)
)
fixture = {
    "numpyVersion": np.__version__,
    "data": data.tolist(),
    "means": mean.tolist(),
    "sampleCovariance": covariance.tolist(),
    "rightHandSide": right_hand_side.tolist(),
    "solve": np.linalg.solve(covariance, right_hand_side).tolist(),
    "distances": distances.tolist(),
    "squaredDistanceSum": float(np.square(distances).sum()),
}
print(json.dumps(fixture, indent=2))
