# Planning and routing upgrade — 2026-10-01

## Delivered

- Contract-derived DAG edges, cycle/missing/ambiguous producer rejection, and sourced existing inputs.
- Read-only session scope is enforced before a runnable write plan is saved.
- Eligible-worker ranking combines declared skills, path ownership, lexical overlap, checked team-local history and weighted load. Allocation evidence is persisted. It is a deterministic heuristic, not trained scheduling.
- Conflicting declared writes/reads wait; independent eligible paths can run concurrently. Permissions, unknown-effect guards and isolated-copy/version checks remain authoritative.
- Team coordination now uses a narrow port; host finalization checks have their own module. Runtime still coordinates the model loop and queue; complete lifecycle decomposition is not claimed.
- Context inspection uses run metadata, revision-keyed bounded snapshots and client request coalescing. Display scale supports 25–150%; the assistant display name is configurable.
- Windows Settings saves protect model, embedding and media keys with current-user DPAPI. Existing settings migrate on next save; other platforms retain restricted files.

## Validation

147 regression tests passed on Windows, including real DPAPI round-trip, negative grading controls, versioned context-cache invalidation, permission checks and scheduling conflicts. Type checking and production build passed. The build still warns about large bundled chunks.

An earlier unconstrained live probe generated a structurally valid graph but expanded read-only scope and unnecessarily serialized work. Nothing in that proposal was executed.

Two comparisons each used **15 authored tasks × 3 repetitions × 2 arms = 90 samples**, with the configured deepseek-flash connection. These are real model requests, but synthetic planning tasks: no worker execution, code delivery, real makespan or end-to-end success was measured.

| Comparison                         | Baseline | Contract guidance + bounded host feedback |
| ---------------------------------- | -------- | ----------------------------------------- |
| Initial contract protocol          | 41/45    | 45/45                                     |
| Existing-input protocol regression | 42/45    | 45/45                                     |

The initial four failures were missing producer declarations for inputs already supplied by the task. A generic externalInputs field was added rather than inventing producer tasks. The second comparison had two missing-input/producer declarations and one malformed tool response in baseline. No missing reachability/over-serialization failure was observed in these constrained samples. This supports improved **protocol adherence**, not superior semantic reasoning.

The second run reuses observed cases: its nominal holdout labels preserve the original split but **are no longer blind-test evidence**. Repetitions are correlated; 45 samples are not 45 independent task families.

In the second comparison, summed request time was approximately 255 s baseline versus 286 s contract; measured output tokens were 47,618 versus 55,650. One baseline malformed response did not expose usage, so baseline totals are incomplete. The connection had no configured prices; cost is unknown, not zero. These numbers do not establish savings or better throughput.

The first runner had a report-aggregation bug after samples were persisted. Aggregation was repaired and reconstructed without replaying calls. The public runner now has a credentials-free report-only mode, upfront manifest, per-sample persistence and explicit incomplete report status.

## Evidence and next boundary

Public synthetic response records: [v1](../evals/results/planning-v1.json), [v2](../evals/results/planning-v2.json). Method and commands: [planning evaluation](../evals/planning/README.md).

A future claim of learned scheduling requires fresh end-to-end tasks, fixed model/resource budgets, comparison against single-agent and load-only baselines, actual completion quality and total cost, and outcome-calibrated effort/worker estimates. The current heuristic does not learn across projects, use code-semantic embeddings, automatically refresh dependent writable copies, or prove optimal delegation.
