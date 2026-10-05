# Live planning comparison

[English](README.md) | [简体中文](README.zh-CN.md) · [Documentation](../../docs/README.md)

This is a real API **planning-only** comparison, not an end-to-end coding benchmark or a worker-throughput claim.
Fifteen authored tasks cover dependencies, independent branches, shared-file ordering and read-only scope. Five are development cases; ten are reserved for evaluation. The model sees task descriptions and IDs, not the expected edge set.

Run from the repository root with a configured connection:

```powershell
node --import tsx evals/planning/run.ts --runs=3 --parallel=2 --output=.diagnostics/planning-run
```

This makes paid requests (90 proposals plus at most one host-validation retry per contract sample). It never executes proposed tools. Use a new output directory; existing results are not overwritten. Settings and raw results stay private.

```powershell
node --import tsx evals/planning/run.ts --report-only --output=.diagnostics/planning-run
```

Report-only rebuilds aggregation from saved samples without API requests.

Both arms use the same profile, output schema and task input. Baseline uses minimal planning instructions; contract adds the production TASK_PLANNING policy and at most one repair from **generic host validation**, never the expected answer. Alternate arm ordering across repetitions. Identical declared dependencies and contract-derived dependencies are normalized.

The grader checks task identity, scope, cycles and transitive dependency reachability. Redundant edges that do not change ordering are accepted; missing dependencies and unnecessary ordering fail. It does not assess code quality, unstructured acceptance-text truth, filesystem outcomes, specialization quality or optimal worker selection. Tests include deliberately wrong plans. API failures count as failed samples; unavailable usage or prices remain unknown. Costs are configured-price estimates, not bills.

Do not tune the prompt against held-out failures and then call a rerun an untouched holdout. Freeze versions and add new cases before evaluating later changes. A ceiling result on these short synthetic prompts means a harder benchmark is needed, not that scheduling is solved.
