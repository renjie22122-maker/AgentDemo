# Coding runtime pilot

This is a small **synthetic coding pilot**, not SWE-bench, not an unseen real-repository benchmark, and not evidence of superiority over another agent.

Uses the production Runtime with a restricted file-tool adapter. Each attempt has an empty, independent store, no memory, knowledge, skills, commands, network tools or delegation. Only the configured model endpoint receives task prompts. Credentials stay in memory. Executable submissions are graded outside the agent scope in a Node permission-restricted process with per-call VM and process deadlines; this is not a container security benchmark.

Two arms: current optimized Runtime; **read-reuse-off** restores complete read tool outputs at the provider boundary. This disables only reference/delta transmission, not all context optimization, snapshots, compaction, or provider caching. Reports record restored message count; zero means the ablation was not exercised. Team evaluation and public benchmark adapters remain future work.

Run from repository root:

```
node --import tsx evals/coding/run.ts --preflight
node --import tsx evals/coding/run.ts --live --limit=10 --repeats=1 --output=.diagnostics/coding-pilot
```

Optional: --profile=ID --seconds=180 --steps=16. Limits apply only to evaluation. Jobs run sequentially with alternating arm order. Existing completed attempt files are reused; an in-progress attempt becomes interrupted_unknown and is NEVER automatically replayed. Manifest mismatch refuses resume. Use a new output directory for a deliberate new attempt.

Hidden checks and references are not sent to the agent; only contract and one example are sent. They are public source code, not contamination-resistant holdouts. Preflight requires reference PASS, broken implementation FAIL, and infinite-loop rejection for the grader. Metrics include all Runtime runs. Incomplete API usage/cost is unknown; cached tokens are part of input, not additional tokens. Provider-internal HTTP retries are not instrumented (null), not silently zero. Local traces/configuration and model output stay under ignored .diagnostics.

Do not interpret small score differences statistically. Start by validating the harness, then add pinned repository tasks, container grading, long-context tasks, independent holdouts, team arms, paired confidence intervals, and multiple repetitions.

## First real API pilot (2026-10-03)

DeepSeek Flash, auto reasoning, 10 tasks x 2 arms x 1 repeat: both arms passed 10/10. All 20 artifacts also passed a subsequent grader audit adding input immutability. The original report is preserved; the audit has a separate grader hash and makes no new API calls.

No read reuse or compaction occurred, so this run **does not establish optimization benefit**. Prices were absent in the configured connection: cost is unknown, not zero. The tasks are deliberately small synthetic exercises. Team, real repositories, long-context stress, external benchmark adapters and statistical confidence remain untested.

Results: [machine-readable report](../results/coding-pilot-20261003.json).

To regrade existing artifacts without model calls:

```
node --import tsx evals/coding/audit.ts .diagnostics/coding-pilot-20261003
```

After a harness revision, use a new output directory for live runs; manifest mismatch intentionally prevents silently mixing versions.
