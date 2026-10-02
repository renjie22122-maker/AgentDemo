# Architecture

## Boundaries

- `shared/`: domain and wire types.
- `server/core/`: lifecycle, model concurrency, orchestration and generic prompts.
- `server/providers/`: protocol-specific serialization, streaming, usage and model discovery. No UI or filesystem execution dependencies.
- `server/tools/`: validated tool registry and capability checks; a tool declaration is separate from its implementation.
- `server/services/`: file access, process execution, approvals, document extraction, retrieval, embeddings, skills and MCP.
- `server/storage/`: SQLite records, ordered events, effects and metering ledger.
- `server/http/`: loopback authenticated API and SSE.
- `src/`: React UI; model credentials never enter public state.
  Sanitized regression tests and CI are public; local credentials, conversations and live-test artifacts are excluded.

The runtime receives a model-provider resolver, making it replaceable in tests. Its tool context contains explicit service ports. Provider-specific reasoning blocks live in model messages, not tool execution code. Subagents reuse the same runtime and shared model pool; they do not create a second orchestration engine.

## Planning and environment boundary

RunEnvironment resolves file scope and constructs model context through explicit store, settings and memory-recall dependencies. It cannot schedule, call providers or mutate execution controllers. Runtime still owns the run lifecycle; this is an incremental separation, not elimination of all orchestration coupling.

Task proposals pass through a typed plan compiler before reaching the board. Scheduling records attributed outcomes and can apply bounded empirical feedback after enough same-scope/model/specialization samples. See [planning and routing](PLANNING-AND-ROUTING.md) for cold-start behavior and evidence limitations.

## Run lifecycle

```mermaid
stateDiagram-v2
 [*] --> queued
 queued --> running
 running --> waiting_user
 running --> waiting_approval
 running --> waiting_children
 waiting_user --> running
 waiting_approval --> running
 waiting_children --> running
 running --> completed
 running --> failed
 running --> interrupted
 queued --> interrupted
 waiting_user --> interrupted
 waiting_approval --> interrupted
 waiting_children --> interrupted
```

Terminal runs are immutable lifecycle endpoints. Continuing creates a new run using the last durable context. A service restart never resumes model or tool work automatically.

## Ordered evidence

User messages, assistant messages, tool starts/results, approvals, usage and status changes are persisted as ordered events. Token deltas are ephemeral for efficient streaming; finalized text is durable. An interrupted partial answer is saved with an incomplete marker.

Side-effect intent is recorded before file writes and commands. Completion is recorded afterwards. Missing results remain unknown. Uncertain effects remain visible for inspection; read-only continuation is possible, but uncertain side effects are not automatically replayed.

This does not provide distributed exactly-once execution. A process can fail between a tool's real effect and its durable result. The ledger exposes that ambiguity.

## Context and delegation

Compaction summarizes complete historical message groups while keeping recent tool-call/result pairs intact. The threshold is calibrated from measured API usage when available, with an explicit local fallback. Usage is metered for compaction requests too.

Children receive a narrow task and deliverable, project facts, selected skills and authorized knowledge scopes. They do not inherit the complete author transcript. Read-only workers remain the default. Writable workers get isolated folder copies and require explicit versioned integration; child commands require an OS isolation backend and external MCP remains disabled. Wait cycles are rejected; cancellation follows descendants.

The parent cannot become terminal with live direct children. Model concurrency is enforced at request admission, including resumed and compaction requests.

## Extension points and remaining work

Use the provider interface for additional protocols, the tool registry for capabilities, and dedicated services for infrastructure. Do not add provider-specific branches to the tool loop.

AppContainer adapters, isolated writable copies and worker-based HNSW are described in MIGRATION.md. ANN now persists content-keyed, checksum-validated native indexes and calibrates sampled neighbor recall against exact search. Remaining work includes broader retrieval-quality evaluation, stronger migration/versioning, cross-platform credential vault integration and comparative unseen-task evaluation.

## Runtime service boundaries

Runtime coordinates run lifecycle and model turns. ContextManager owns compaction with injected model/storage ports. ToolExecutor owns the effect journal, spill and checkpoint delivery; executeBatch implements bounded observational concurrency with serial mutation barriers. DelegationManager owns run-tree scope, child limits, wait-cycle prevention and isolated-copy integration through a small host interface.

Only audited file-read tools overlap, at most four per batch. Network, retrieval-index mutation, commands, approvals, coordination and writes remain serial. Started reads settle before cancellation/failure unwinds; successful tool messages commit in declared call order. This is not arbitrary dependency inference.

TaskBoard is an optional durable DAG: the lead creates a plan; workers claim ready tasks using optimistic revisions. Owners or lead update tasks, and done requires successful tool-result event references from the same tree. Evidence references prove provenance, not semantic correctness or independent review. A task run cannot report completed with its declared plan unfinished. Plans do not grant file ownership or bypass isolated merging.

Memory recall filters confirmation, expiration and project scope before relevance ranking and deduplication, with a bounded prompt allocation. Semantic indexing is an explicit user action which sends confirmed memory text to the configured embedding provider. Index entries bind content revision/scope and model fingerprint. Recall uses semantic similarity when a valid index is available, otherwise lexical relevance; deleted or changed entries are rechecked after network requests. Similarity does not resolve contradictions or prove truth.

Storage retains JSON domain records for local compatibility, with a versioned schema migration marker and indexed per-conversation run lookup. This is not a multi-tenant or distributed store.

Protocol repair permits one additional model request per run for rejected malformed arguments or duplicate call IDs. No tools from the rejected response have executed. Both requests are accounted; authentication failures, ambiguous execution and arbitrary command failures are not replayed.

## Version-bound observations and team handoff

Plans may declare artifact paths. For read_file and run_command, the host hashes declared files before and after execution (4 MB per file, 16 MB per observation). record_verification accepts only an existing successful observation with matching workspace identity and unchanged declared files; a file read must address the declared path. Command success is an observed zero exit code, not a proof of the acceptance criterion. Missing, oversized or inaccessible files cannot be certified.

Verification has three user-facing meanings: author-reported (no binding), checked (observed result bound to a version), and stale. inspect_plan and run finalization recheck bound versions; stale records block completion. This is point-in-time validation, not a filesystem lock, adversarial TOCTOU protection, full dependency discovery or independent semantic review. Snapshots now expand declared read paths, recognized local JS/TS imports and root dependency manifests. Dynamic imports, build-system resolution, excluded dependency/build directories and other undeclared inputs are not fully covered. Isolated-copy evidence cannot certify the parent copy after merge; recheck in the destination.

inspect_team exposes same-root members, statuses, task ownership and handoff history. Lead-only handoff_task reassigns an unfinished task using an optimistic board revision. The old owner and descendants must be terminal and free of unknown effects; the target must be an active same-team member. It clears old evidence, records the transfer and attempts a steering notification, reporting whether delivery was queued. It does not start workers, grant permissions, copy files or replay operations. Scheduling and selection remain model-directed. Boards are scoped to a run tree, not automatically inherited by a new top-level run.

## October 2026 routing and runtime boundaries

- Task contracts distinguish sourced existing inputs from provided/required outputs; the host derives dependencies and rejects missing producers, ambiguity and cycles.
- File read/write hints prevent conflicting assignments. These are planning hints, never an OS isolation boundary.
- Worker skills/path ownership and word overlap supplement capacity. Only checked completion evidence contributes positively to team-local history; blocked relevant work reduces the score. This is bounded heuristic adaptation, not trained scheduling or code-semantic analysis.
- Existing task weight remains an explicit effort/capacity estimate. No hidden token budget is introduced.
- Dependent writable tasks still require lead-managed refreshed copies; automatic assignment refuses stale-copy risks.
- TeamCoordinator owns dispatch and event waits through a narrow port. finalizeRun owns host completion checks. ToolExecutor, ContextManager and DelegationManager retain separate responsibilities. Runtime remains the composition root and model-loop coordinator; RunPump now owns execution queue, per-conversation capacity, cancellation and shutdown draining through a narrow port. Recovery policy and lifecycle coordination still remain partly in Runtime.
- Still unproven: optimal delegation, cross-project learning, unseen-task quality/cost superiority. One live planning probe cannot establish these.

The public planning comparison lives in evals/planning. It grades real model proposals against authored DAG expectations without executing generated work. This is planning-protocol evidence, not end-to-end task success or proof that heuristic worker ranking improves throughput.

### Persistent delegated members

A delegated conversation is a stable member (agentId); each activation has a
separate runId. list_agents discovers direct members from prior parent turns,
continue_agent starts an idle member with its retained checkpoints, and
close_agent archives an idle member without deleting history. Idle members
make no model calls. Normal compaction still applies, so retained context is
not an exact or infallible memory store. Private histories are not broadcast.

Continuation requires direct delegation provenance (a user fork is not a member),
matching project/recorded workspace roots, enabled delegation, depth/call capacity,
and no active descendants, pending background commands or unknown effects.
Current parent knowledge/skill/model policies are applied without promoting a
read-only member. Writable members retain a ready isolated copy; after a successful
merge they receive a fresh copy. Merging still requires explicit approval and
version checks. No interrupted operations are automatically replayed.
Continuation receipts use the same crash reconciliation as spawn receipts.

Team rosters and boards remain run-scoped: continue members first, then configure
the new team with the returned current run IDs and current coordinator run ID.
This preserves member continuity, not a cross-run migration of old task-board
ownership or completed approvals.
