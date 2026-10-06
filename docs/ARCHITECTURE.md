# Architecture

[English](ARCHITECTURE.md) | [简体中文](ARCHITECTURE.zh-CN.md) · [Documentation](README.md)

Reviewed: 2026-10-06.

## Module boundaries

- `shared/`: domain and wire types; `server/storage/`: SQLite records, ordered events, effects and usage.
- `server/core/`: model loop, pump, lifecycle, context, delegation, team coordination and deterministic cognitive policy.
- `server/providers/`: protocol serialization, streaming, model discovery and measured usage.
- `server/tools/`: schemas, discovery, availability, permissions and audited invocation.
- `server/services/`: execution, approvals, files, knowledge, memory, media, MCP and background work.
- `server/http/`: authenticated loopback API/SSE; `src/`: React interface.

RunEnvironment builds scoped model facts through explicit dependencies without scheduling work. RunPump controls admission and draining; finalization and team coordination use separate modules. Runtime remains the composition root and model-loop coordinator: decomposition reduces coupling but does not eliminate it.

## Lifecycle and durable effects

Runs use queued, running, waiting_user, waiting_approval, waiting_children, completed, failed and interrupted states. Terminal runs are not resurrected; continuation creates a new run. Structured termination reasons distinguish recoverable limits/protocol interruption from failures.

Tool intent and results are journaled. Pre-start failures are not_started; ambiguous external effects remain unknown. Startup reconciliation atomically interrupts old runs and cancels orphaned inputs. Opt-in team recovery can start an inspected new turn; arbitrary commands are never replayed merely because the service restarted. See [recovery](INTERACTION.md).

SSE carries persisted event IDs with up to 1,000 replayed events; larger gaps request an authoritative snapshot. Token deltas are ephemeral, finalized content durable. Provider streams have request and byte-idle deadlines. Partial streams are not automatically retried.

## Context and control

Measured main-request tokens calibrate local estimates; tool schemas and images contribute to capacity. Compaction preserves latest requests, complete recent tool pairs and an ordered verbatim request-source ledger. A summarizer failure may externalize older history to scoped spill storage. Protected requirements that still cannot fit produce an explicit error.

Repeated reads execute again before eligible reference/delta substitution. Source hashes, retained bases and model/tool configuration prevent stale reuse. No cached model answer or old test success substitutes for execution. See [prefix caching](DEEPSEEK-CACHE.md).

The cognitive controller derives repetition, progress and verification signals from observations, excludes event-driven waits, and emits bounded advice/recovery proposals. It is a deterministic policy, not another LLM agent. Follow-up assessments show observed change, not causal improvement.

## Teams

Plan compilation validates contracts and dependency graphs before scheduling. A read-only blackboard projects tasks, recipient-visible messages, artifacts, evidence and unknown effects; bounded selective context marks omitted entries. Source records stay authoritative.

Persistent members can continue through new runs while preserving conversation history. Isolation, ancestry, depth, permissions, current role revisions and unresolved effects still gate continuation. Writable child copies require versioned review/merge. Roles grant coordination authority, not permissions.

Model concurrency defaults to 3 per conversation; cumulative child executions default to 8 per tree. Explicit 0 disables that count limit, including continued members. Depth, budgets, provider quotas and team automation limits remain separate. See [routing](PLANNING-AND-ROUTING.md).

## Limits

This is a single-host runtime, not distributed consensus or exactly-once external execution. Provenance is not semantic correctness; filesystem observations are not adversarial locks. Broad held-out performance and security claims require independent evaluation.

Memory, policy and graph routes now live in server/http/memory.ts with explicit Store, Configuration and MemoryIndex dependencies. The HTTP composition root retains shared authentication and lifecycle hooks; this does not finish decomposing App.tsx or the tool registry.
