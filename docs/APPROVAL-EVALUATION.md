# Approval evaluation: historical result

[English](APPROVAL-EVALUATION.md) | [简体中文](APPROVAL-EVALUATION.zh-CN.md) · [Current docs](README.md)

The 2026-10-02 experiment did **not** demonstrate an incremental reduction in manual approvals. Each arm made 24 decisions: 12 manual, 12 expected-safe allowed, 0/12 expected-human incorrectly allowed, no failures/timeouts. Input tokens were 11,076 / 13,190; output 20,024 / 14,172. Cost was unknown.

It used 12 synthetic cases × two repeats × two arms, including four deterministic shortcuts and 44 real model calls. The baseline removed selected new prompt/evidence fields; it was not an old-release checkout. No proposed command was executed, and no private source was sent. Cases were balanced, repeats correlated, and zero false allows in this small set is not a production error-rate estimate.

[Archived full methodology](history/2026-10-05-before-consolidation/docs/APPROVAL-EVALUATION.md) · [Public verdicts](approval-evaluation-20261002.json) · [Current approval design](AUTO-REVIEW.md).

Current runner, from repository root:

```sh
node --import tsx benchmarks/approval-eval.ts --live
```

This incurs configured-model charges and writes local diagnostics. Running current code does not reproduce the exact historical policy unless its version is pinned. Track false allows, human rate, failures, latency and cost; do not relax guards merely to reduce prompts.
