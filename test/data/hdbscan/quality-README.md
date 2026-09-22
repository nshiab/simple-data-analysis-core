# HDBSCAN sparse quality and tied hierarchy references

These additional fixtures use the exact Python `hdbscan==0.8.44` environment in
[requirements.txt](requirements.txt). The generators verify every dependency
pin. The older feasibility benchmark retains its historical 0.8.40 provenance.

From the repository root, with that environment activated:

```sh
python test/data/hdbscan/quality-generate.py > test/data/hdbscan/quality-reference.json
deno run -A benchmarks/hdbscan/quality.ts > benchmarks/.work/current-quality-results.json
python test/data/hdbscan/quality-ties.py > test/data/hdbscan/quality-tie-reference.json
```

`quality-generate.py` uses NumPy seed 192044 and records all input vectors, core
distances, MST edges, labels, membership strengths, and GLOSH scores. Settings
are explicit: generic exact MST, alpha 1, EOM, no selection epsilon/persistence,
`allow_single_cluster=False`, no cluster size ceiling, and ordinary reference
semantics. The two 512-point cases contain curved shapes, different densities,
and noise under Euclidean and cosine metrics. Two smaller cases isolate the
representative and chain repair seams; they are controlled topology probes, not
outputs expected from the default HNSW graph at those sizes.

The committed `quality-results.json` preserves the original approximation
measurements used by `quality-ties.py`; do not replace it with a new
approximation run. Current approximation evidence is documented in
[the improvement report](../../../benchmarks/hdbscan/approximation-improvements.md).

`quality-ties.py` feeds the recorded native MST, sorted by distance and
canonical endpoints, directly to Python's linkage, condensation, EOM, and GLOSH
routines. It asserts exact equality with every recorded native label and score.
It then reverses only selected blocks of exactly equal-weight edges and records
the resulting boundary-point changes. Distances, edges, and MST objective stay
fixed. The unit tests also insert the fixture edges in reverse order to verify
that SDA applies its documented deterministic endpoint rule.

This separates hierarchy compatibility from Python's incidental equal-distance
MST ordering. The tied points leave at their parent cluster's birth lambda, so
binary tie ordering can assign them different condensed parents and descendant
maximum lambdas. The public implementation retains deterministic ties; exact
metric-based output need not match Python at these boundaries. Native stable
Euclidean distance also remains intentional: sklearn's squared-norm/dot-product
formula loses a unit separation at a common offset of 1e12. See the retained
large-offset and decimal/dyadic probes in
[degenerate-reference.json](degenerate-reference.json).

The reference archive/source provenance, infinity convention, and regeneration
instructions for the ordinary fixtures are in [README.md](README.md). Quality
measurements and limitations are in
[qualityREADME.md](../../../benchmarks/hdbscan/qualityREADME.md).
