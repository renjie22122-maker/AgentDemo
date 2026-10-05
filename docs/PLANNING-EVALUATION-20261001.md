# Planning evaluation: 2026-10-01

[English](PLANNING-EVALUATION-20261001.md) | [简体中文](PLANNING-EVALUATION-20261001.zh-CN.md) · [Current docs](README.md)

Historical planning-only evaluation; current behavior is in [planning and routing](PLANNING-AND-ROUTING.md). Each comparison used 15 authored tasks × three repetitions × two arms = 90 proposals.

| Comparison                | Baseline | Contract guidance + host feedback |
| ------------------------- | -------- | --------------------------------- |
| Initial protocol          | 41/45    | 45/45                             |
| Existing-input regression | 42/45    | 45/45                             |

The first failures concerned undeclared already-supplied inputs; a generic externalInputs field was added. The second baseline had two declaration failures and one malformed response. This measured protocol adherence, not code execution, worker throughput or semantic superiority. Reused cases in the second run were no longer blind holdouts.

Second comparison: summed request time about 255/286 seconds, output tokens 47,618/55,650. One baseline response lacked usage; prices were absent. No savings claim follows. The report aggregation bug was repaired from saved samples without replaying calls. Historical regression count was 147, not today's suite.

[Full historical report](history/2026-10-05-before-consolidation/docs/PLANNING-EVALUATION-20261001.md) · [v1 data](../evals/results/planning-v1.json) · [v2 data](../evals/results/planning-v2.json) · [Runner and grading](../evals/planning/README.md).

End-to-end scheduling claims still need new held-out tasks, matched resources, actual quality, latency and total cost.
