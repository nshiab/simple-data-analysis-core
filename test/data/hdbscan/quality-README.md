# HDBSCAN sparse quality and tied hierarchy references

These additional fixtures use the exact Python `hdbscan==0.8.44` environment in
[requirements.txt](requirements.txt). The generators verify every dependency
pin.

From the repository root, with that environment activated:

```sh
python test/data/hdbscan/quality-generate.py > test/data/hdbscan/quality-reference.json
deno run -A test/data/hdbscan/quality-native.ts | python test/data/hdbscan/quality-ties.py > /tmp/quality-tie-reference.json
```

`quality-generate.py` uses NumPy seed 192044 and records all input vectors, core
distances, MST edges, labels, membership strengths, and GLOSH scores. Settings
are explicit: generic exact MST, alpha 1, EOM, no selection epsilon/persistence,
`allow_single_cluster=False`, no cluster size ceiling, and ordinary reference
semantics. The two 512-point cases contain curved shapes, different densities,
and noise under Euclidean and cosine metrics. Two smaller cases isolate the
representative and chain repair seams; they are controlled topology probes, not
outputs expected from the default HNSW graph at those sizes.

`quality-native.ts` computes the two native exact MSTs and their hierarchy
outputs solely for fixture generation. It writes JSON to stdout; no performance
measurements or approximation sweeps are involved. `quality-ties.py` reads that
JSON from stdin and feeds the MSTs, sorted by distance and canonical endpoints,
directly to Python's linkage, condensation, EOM, and GLOSH routines. It asserts
exact equality with every native label and score, then reverses selected blocks
of exactly equal-weight edges and records the resulting boundary-point changes.
Distances, edges, and MST objective stay fixed. The unit tests also insert the
fixture edges in reverse order to verify SDA's deterministic endpoint rule.

Review `/tmp/quality-tie-reference.json` before replacing the committed fixture.
The existing fixture's `inputResultsSha256` records its original generator
input; regeneration records the hash of the new native-only JSON input. The
expected MSTs, labels, and scores remain the correctness contract.

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
instructions for the ordinary fixtures are in [README.md](README.md).
