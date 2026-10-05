# Paired context and control probes

[English](README.md) | [简体中文](README.zh-CN.md) · [Documentation](../../docs/README.md)

Run from the repository root:
node --import tsx evals/context-control/run.ts --live --runs=3

Uses the configured provider and incurs API charges. Inputs are synthetic; project
files, private conversations and credentials are not included. Six cases cover
bilingual constraints, revised requirements, repetition, event waits, productive
work and verification. Retention cases use the same twice-summarized history for
both variants; enabled adds original source records. Control cases share the same
facts; enabled adds the policy's advice. Variant ordering alternates by round.

The versioned report includes configuration, samples, correctness, usage, price-based
cost and latency, with shared summarization costs reported separately. It is an
ablation smoke test, not an end-to-end coding benchmark. A tie is evidence of no
observed benefit on these cases, not justification to claim improvement. Cache
warmth, small sample size and fixed task templates limit comparisons.

## Recorded run (2026-10-03)

deepseek-flash, six cases x three repetitions x two variants, plus twelve shared
summary calls. Semantic scoring: off 13/18, on 16/18. Source-ledger cases were
6/6 in both variants; advisory cases were also 6/6 in both. The remaining
identical-prompt cases scored 1/6 versus 4/6, so the aggregate difference cannot
be attributed to the implementation. Input totals for graded requests were 2,958
versus 3,798 tokens, average latency 1,607 versus 1,635 ms. Configured prices were
incomplete; USD totals remain unknown.

The original strict string grader mislabeled JSON-encoded correct actions. Grader
v2 separates formatting from semantic action, rejects conflicting choices, and
regrades the preserved responses without new API calls. Remaining failures are
retained. This run does not establish a success-rate improvement.
