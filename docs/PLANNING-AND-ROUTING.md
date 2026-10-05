# Planning and empirical routing

Amadeus separates plan proposals, host graph validation, scheduling, and verification.
None of these is a proof that a program is correct.

## Plan proposals and compilation

The model proposes tasks. Optional task kinds are inspect, implement, verify and deliver.
preview_plan compiles the same schema used by create_plan without creating work. The compiler
resolves provides/requires contracts, checks read-only scope and cycles, emits dependency
layers and warns about resource overlap or missing explicit verification successors.
A verify task must declare dependencies. The compiled graph is saved with the task board.

The host supplies planning policy from observed file changes and delegation. Three changed
file paths or two delegation attempts recommend a plan. Existing plans are recognized.
This is deterministic observation, not natural-language complexity detection; it does not
force ordinary questions through a planner or prove the model chose a complete decomposition.

## Measured feedback in routing

Existing expertise, file ownership and load scores remain the cold-start baseline. Task
attempts record start/end time, model route, project scope and successful/failed tool results.
Estimated cost is a difference of host usage accounting, not a provider invoice. Concurrent
tasks sharing a worker make attribution ambiguous; those attempts do not train routing.
Cancellation, permission and connection errors are not evidence of model incompetence.

A bounded empirical adjustment activates after five relevant attributed samples from the
last 30 days (up to 50 samples), restricted to the same project, model route and declared worker specialization. Ordinary
chat history is conversation-local. Checked outcomes require the current task still have
valid recorded verification; stale, unverified or reopened tasks are excluded. Blocked
attempts only count when they include an observed tool failure. This is not a true failure
probability: blocking has multiple causes.

Routing considers smoothed check rate, median elapsed time, median estimated cost and
observed outcomes for declared requiredTools. Null/unknown cost is never converted to zero.
Required tool names and expertise are hints; they grant no tools or permissions. Permission,
isolation, capacity and dependency checks still precede assignment.

This is feedback-informed heuristic routing, not global optimization, a calibrated success
predictor, or demonstrated superiority over the previous scheduler. Offline regression verifies
mechanisms; paired held-out real tasks are needed to establish gains in success/cost/latency.

## Runtime boundaries and verification

RunEnvironment owns workspace resolution, scoped memory recall and construction of model
context facts. It has no provider, lifecycle, scheduler or execution-controller access.
Runtime retains run lifecycle and tool/model iteration; this is an incremental boundary,
not a claim that all orchestration coupling has been eliminated.

Recorded verification now distinguishes a file observation from a command check, and whether
the checking run differs from the task owner. A separate run is not necessarily independent
reasoning. Tests, negative controls and independent inputs remain essential.
