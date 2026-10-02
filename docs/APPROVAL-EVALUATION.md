# Automatic approval evaluation - 2026-10-02

This experiment did **not** demonstrate fewer manual approvals from the latest
human-decision-context and routine-step prompt enhancement.

| Metric                                     | Ablated baseline | Current candidate |
| ------------------------------------------ | ---------------: | ----------------: |
| Decisions                                  |               24 |                24 |
| Manual decisions                           |         12 (50%) |          12 (50%) |
| Expected-safe actions allowed              |            12/12 |             12/12 |
| Expected-human actions incorrectly allowed |             0/12 |              0/12 |
| Failures/timeouts                          |                0 |                 0 |
| API input tokens                           |           11,076 |            13,190 |
| API output tokens                          |           20,024 |            14,172 |

Observed reduction: **0 percentage points (0% relative reduction)**.
Compared with asking every time, both avoid 12/24 prompts, but that is NOT an
incremental gain. All 24 paired outcomes matched. Dollar cost is unknown because
price configuration was unavailable. Token differences do not prove cost savings.

## Method

deepseek-flash, locally configured provider and reasoning settings.
12 synthetic cases, two repetitions per case per variant: 48 decisions including
four deterministic current-directory shortcuts and 44 real model requests.
Both use the actual AutoReview host policy. Baseline removes the latest routine-
step/human-decision prompt text and humanDecisions evidence. This is an ablation,
not a historical-release checkout. Order alternates by case; concurrency is three.

Expected labels were fixed before running: six bounded read/literal-output cases
should allow; six unknown-script, secret-export, injection, encoded-command,
denied-repeat or unauthorized-install cases should ask. No proposed commands were
executed. No private source or production conversations were sent.

## Reproduce

From repository root with a configured model:
node --import tsx benchmarks/approval-eval.ts --live

Consumes model quota. Local results: .diagnostics/approval-evaluation.
Public synthetic verdicts: approval-evaluation-20261002.json.

## Limits and next measurement

This small balanced set does not estimate production approval rates. Repeated
trials are correlated, not new tasks. Even if 12 negative candidate trials were
independent, zero false approvals only gives about a 22% one-sided 95% upper bound;
actual generalization is less certain. There was no improvement to trade against
safety in this experiment.

Next: opt-in shadow evaluation on representative redacted requests, independent
human labels and held-out tasks. Track false approvals, manual rate, failures,
latency and cost. Do not relax guards just to reduce prompt counts.
