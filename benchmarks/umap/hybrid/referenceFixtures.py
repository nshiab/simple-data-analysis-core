"""Generate optimizer traces from the installed reference's unmodified epoch routine.

Only its RNG and squared-distance/clip helpers are substituted, to isolate the
update algorithm from different random streams and float32 rounding. Curve
fitting is checked independently against scipy's reference find_ab_params.
"""
import os
os.environ["NUMBA_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
import json
import subprocess
from pathlib import Path
import numpy as np
import umap
import umap.layouts as layouts
from umap.umap_ import find_ab_params


def random_stream(seed):
    state = seed & 0xffffffff
    while True:
        state = (state + 0x6D2B79F5) & 0xffffffff
        value = ((state ^ (state >> 15)) * (1 | state)) & 0xffffffff
        value ^= (value + (((value ^ (value >> 7)) * (61 | value)) & 0xffffffff)) & 0xffffffff
        yield ((value ^ (value >> 14)) & 0xffffffff) / 4294967296


distances = [0, 0.025, 0.1, 0.25, 0.5, 0.8, 1]
curves = [dict(minDistance=m, parameters=list(find_ab_params(1, m))) for m in distances]
code = 'import fit from "./benchmarks/umap/hybrid/fitUmapCurve.ts"; console.log(JSON.stringify([0,0.1,0.5].map(m=>fit(m))))'
candidate_curves = json.loads(subprocess.check_output(["deno", "eval", code], text=True))
cases = []
for index, minimum in enumerate([0, 0.1, 0.5]):
    for coincident in [False, True]:
        count, epochs, negatives, seed = 6, 8, 3, 42
        head = np.array([0, 0, 1, 1, 2, 2, 3, 4, 4, 5])
        tail = np.array([1, 2, 0, 2, 0, 1, 4, 3, 5, 4])
        weights = np.array([1, 0.5, 1, 0.25, 0.5, 0.25, 0.001, 0.001, 0.8, 0.8])
        rng = random_stream(seed)
        initial = np.array([[next(rng) * 20 - 10, next(rng) * 20 - 10] for _ in range(count)])
        if coincident:
            initial[:] = 0
        coordinates = initial.copy()
        period = epochs / ((weights / weights.max()) * epochs)
        period[weights < weights.max() / 500] = np.inf
        next_positive = period.copy()
        negative_period = period / negatives
        next_negative = negative_period.copy()
        rng = random_stream(seed ^ 0x7f4a7c15)
        layouts.tau_rand_int = lambda _: int(next(rng) * count)
        layouts.rdist = lambda a, b: float(sum((float(x) - float(y)) ** 2 for x, y in zip(a, b)))
        layouts.clip = lambda value: min(4, max(-4, value))
        a, b = candidate_curves[index]
        alpha = 1.0
        trace = []
        for epoch in range(epochs):
            layouts._optimize_layout_euclidean_single_epoch(
                coordinates, coordinates, head, tail, count, period, a, b,
                np.zeros((count, 3), dtype=np.int64), 1.0, 2, True, alpha,
                negative_period, next_negative, next_positive, epoch,
                False, np.zeros(1), np.zeros(1), 0., 0., 0., 0., np.zeros(1), np.zeros(1), 0.)
            alpha = 1 - epoch / epochs
            trace.append(coordinates.flatten().tolist())
        cases.append(dict(minDistance=minimum, seed=seed, epochs=epochs, negativeSamples=negatives,
                          initial=initial.flatten().tolist(), source=head.tolist(), target=tail.tolist(),
                          weight=weights.tolist(), curve=[a, b], trace=trace))
path = Path("test/data/umap/layout-reference.json")
path.write_text(json.dumps(dict(version=umap.__version__, curves=curves, cases=cases,
    policy="Reference epoch routine; shared Mulberry32 draws and float64 arithmetic. Candidate curve parameters supplied separately to isolate SGD; curve fitting checked against independent scipy reference values."), indent=2) + "\n")
