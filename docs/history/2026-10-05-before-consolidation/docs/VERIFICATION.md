> Archived source / 历史原文：snapshot before documentation consolidation, 2026-10-05, commit `d663030`. Claims and counts describe their original revisions, not current behavior. Relative links point to the pinned source revision. / 结论和数量仅对应原记录版本；相对链接已指向固定历史提交。

# Verification

## Reproduce

Use Node 24 or newer and pnpm 11.19.0:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

GitHub Actions runs these checks on Windows and Linux. Local passing results do not establish remote CI status.

## Current audit

113 local regression tests passed on Windows. Coverage includes durable follow-up delivery after model failure, interrupted merge continuation and version conflicts, recovery ownership, scheduler eligibility, provider truncation classification and bounded HTTP retries, checkpoint persistence, and exclusive service ownership. Tests use temporary stores and fake credentials. This is mechanism coverage, not an unseen-task success benchmark.

Three previously failing reproductions now confirm: queued follow-ups reach the next model request; merged workers receive no writable assignments; changing discovery origin does not forward the saved credential.
A real DeepSeek Flash trial read a randomized raster code and color exclusively through read_image. It validates that route, not general visual accuracy.

## Boundaries

- Native AppContainer and Docker integrations require their respective host environments; unit tests do not certify OS isolation.
- Native reparse points, including dependency junctions, remain rejected. Do not replace this with silently following links; use a supported materialized dependency layout or explicitly approved host execution.
- Unknown command/write effects still require reconciliation. Recovery never automatically replays ambiguous side effects.
- Team terms are audit revisions. Current-role checks and a single service lock enforce this host's authority; this is not distributed consensus.
- Checkpoint separation reduces repeated database writes. JSON serialization still runs in-process.
- Historical validation counts elsewhere document their revisions, not today's suite or universal capability.
- Real Anthropic, Gemini, and Responses endpoints were not exercised in this audit; their protocol error paths were tested with fixtures.

## 2026-10-01 update

147 Windows regression tests, TypeScript checking and production build passed. Two real-model planning comparisons each used 15 tasks, 3 repetitions and 2 arms. See [the results and limitations](https://github.com/renjie22122-maker/Amadeus/blob/d6630309c33e9f2ae08dbeb3c8faf1fe894da897/docs/PLANNING-EVALUATION-20261001.md); these are planning-protocol checks, not autonomous coding or learned-scheduler benchmarks.

## Dependency-aware snapshots and dispatch shutdown

Verification snapshots include task artifacts and declared readPaths (including bounded
directory traversal), root package/lock/config manifests, and recognizable relative JS/TS
imports/re-exports/require calls. The lexical import recognizer is conservative, not a full
language resolver: comments may cause false positives, dynamic imports and package resolution
are incomplete. Declare additional inputs explicitly. Standard dependency/build/private
directories are excluded when walking directories. Snapshots cap at 512 entries, 4 MB per file
and 16 MB total; exceeding limits or unresolved imports marks them incomplete and rejects binding.

Opened-file metadata is checked before/after hashing and against the current scoped path.
Checks reject changes during execution, manifest removal and declared directory input deletion
before recording. This narrows stale-evidence gaps; it is not a lock or adversarial TOCTOU proof.
A concurrent writer can still race between observations or restore earlier bytes.
A check's zero exit code still does not establish its acceptance criterion.

RunPump is tested for per-conversation fairness, queued cancellation and shutdown draining.
Stopping acceptance prevents completed tasks from dispatching queued work during shutdown.
