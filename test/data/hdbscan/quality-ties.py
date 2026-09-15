"""Isolate hierarchy semantics and tie sensitivity with identical recorded MSTs.

Run after quality.ts writes benchmarks/hdbscan/quality-results.json. Only the
order of the identified equal-weight edges changes in the alternative probes.
"""
import importlib.metadata
import json
from pathlib import Path
import hashlib

import numpy as np
from hdbscan._hdbscan_linkage import label
from hdbscan.hdbscan_ import _tree_to_labels
from hdbscan._hdbscan_tree import outlier_scores

base = Path(__file__).resolve().parent
root = base.parents[2]
expected = dict(line.split("==") for line in (base / "requirements.txt").read_text().splitlines() if line)
packages = {name: importlib.metadata.version(name) for name in expected}
assert packages == expected
report_text = (root / "benchmarks/hdbscan/quality-results.json").read_text()
reports = json.loads(report_text)
refs = {c["name"]: c for c in json.loads((base / "quality-reference.json").read_text())["cases"]}


def outputs(mst, ref):
    labs, probs, _, tree, _ = _tree_to_labels(
        np.asarray(ref["vectors"]), label(np.asarray(mst)),
        min_cluster_size=ref["minClusterSize"], allow_single_cluster=ref["allowSingleCluster"],
        cluster_selection_method="eom", match_reference_implementation=False,
        cluster_selection_epsilon=0.0, cluster_selection_persistence=0.0,
        max_cluster_size=0, cluster_selection_epsilon_max=float("inf"),
    )
    return dict(labels=labs.tolist(), probabilities=probs.tolist(),
                outlierScores=outlier_scores(tree).tolist()), tree


cases = []
for report in reports["cases"][:2]:
    ref = refs[report["name"]]
    mst = sorted(report["exactNativeMst"], key=lambda e: (e[2], min(e[:2]), max(e[:2])))
    common, tree = outputs(mst, ref)
    assert common == report["exactNativeOutputs"], "Same ordered MST must match all Python outputs"
    points_to_reverse = [76, 125] if ref["metric"] == "euclidean" else [409]
    reversals = []
    for point in points_to_reverse:
        exit_edge = tree[tree["child"] == point][0]
        # Locate an exact equal-weight block using an incident edge, without
        # introducing an isclose tolerance into the ordering experiment.
        candidates = [e[2] for e in mst if point in e[:2] and abs(e[2] * exit_edge["lambda_val"] - 1) < 1e-14]
        weight = candidates[0]
        indices = [i for i, edge in enumerate(mst) if edge[2] == weight]
        assert len(indices) > 1
        changed = list(mst)
        for position, edge in zip(indices, reversed([mst[i] for i in indices])):
            changed[position] = edge
        alternate, alternate_tree = outputs(changed, ref)
        affected = [i for i in range(len(ref["vectors"]))
                    if common["labels"][i] != alternate["labels"][i]
                    or abs(common["outlierScores"][i] - alternate["outlierScores"][i]) > 1e-12]
        details = []
        for i in affected:
            same_edge = tree[tree["child"] == i][0]
            alt_edge = alternate_tree[alternate_tree["child"] == i][0]
            birth = tree[tree["child"] == same_edge["parent"]]
            details.append(dict(point=i, originalParent=int(same_edge["parent"]),
                                reversedParent=int(alt_edge["parent"]), exitLambda=float(same_edge["lambda_val"]),
                                originalParentBirth=float(birth[0]["lambda_val"]) if len(birth) else 0,
                                originalLabel=common["labels"][i], reversedLabel=alternate["labels"][i],
                                originalMembership=common["probabilities"][i], reversedMembership=alternate["probabilities"][i],
                                originalGlosh=common["outlierScores"][i], reversedGlosh=alternate["outlierScores"][i]))
        reversals.append(dict(weight=weight, canonicalEdges=[mst[i] for i in indices],
                              reversedEdges=[changed[i] for i in indices], affectedPoints=details))
    cases.append(dict(name=ref["name"], count=len(ref["vectors"]), minClusterSize=ref["minClusterSize"],
                      allowSingleCluster=ref["allowSingleCluster"], mst=mst, expected=common,
                      inputOrdering="distance, minEndpoint, maxEndpoint", isolatedTieReversals=reversals))
print(json.dumps(dict(generator="test/data/hdbscan/quality-ties.py", packages=packages,
                      inputResultsSha256=hashlib.sha256(report_text.encode()).hexdigest(),
                      purpose="Same-MST Python parity and explicit deterministic tie convention evidence", cases=cases), indent=2, allow_nan=False))
