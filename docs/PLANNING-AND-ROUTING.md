# Planning and empirical routing

[English](PLANNING-AND-ROUTING.md) | [简体中文](PLANNING-AND-ROUTING.zh-CN.md) · [Documentation](README.md)

Reviewed: 2026-10-05; code baseline: `d663030`.

## Plan before scheduling

The LLM proposes inspect/implement/verify/deliver tasks. preview_plan uses the same compiler as create_plan without creating work. The host resolves provides/requires and sourced external inputs, rejects cycles and missing/ambiguous producers, checks read-only scope and records layers/resource warnings. Verify tasks declare dependencies.

Observed changes to three files or two delegation attempts can recommend a plan. This is deterministic observation, not a natural-language complexity oracle or proof of a complete task decomposition.

## Assignment

Eligibility checks precede scoring: dependency readiness, permissions, isolation, resource conflicts, capacity and unresolved effects. Cold-start scores use declared expertise, path ownership, lexical task relevance and load. A readonly blackboard gives task, message, artifact and evidence context without changing permissions.

Attempts record route/scope/specialization, elapsed time, usage-derived cost and tool outcomes. Ambiguous concurrent attribution is excluded; cancellation, permission and connection errors are not model incompetence. Checked history requires still-valid verification; reopened, stale and unverified work cannot train success.

After five relevant attributed samples in the last 30 days (up to 50), bounded feedback considers smoothed check rate, median time/cost and required-tool outcomes. Unknown cost is not zero. Project histories do not mix; ordinary chat history is conversation-local.

## Recovery and evaluation

Opt-in team automation can recover inspected read-only members, add bounded workers, retire idle host-created workers and transfer coordinator roles. Reservations and role revisions fence duplicate/stale mutations. Unknown write outcomes are not automatically reassigned.

This remains feedback-informed heuristic routing, not a calibrated success predictor or optimal global scheduler. Role transfer is single-host coordination, not distributed consensus.

The [2026-10-01 planning report](PLANNING-EVALUATION-20261001.md) measured protocol adherence only. Future gains require fresh held-out end-to-end tasks with matched resources, quality, total cost and latency. Another-run verification and exit-zero evidence do not prove semantic correctness.
