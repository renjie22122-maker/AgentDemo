> Archived source / 历史原文：snapshot before documentation consolidation, 2026-10-05, commit `d663030`. Claims and counts describe their original revisions, not current behavior. Relative links point to the pinned source revision. / 结论和数量仅对应原记录版本；相对链接已指向固定历史提交。

# Migration: Windows isolation, ANN, writable subagents

Implemented in Amadeus on 2026-09-30. Agent4Learning is not imported at runtime or modified by this migration.

## Windows execution

Select Windows AppContainer in Settings and provide an absolute Python interpreter path. TypeScript starts native/windows/bridge.py through JSON stdin/stdout. The adapter owns the AppContainer SID, directory ACL grants, suspended launch and kill-on-close Job Object. Orchestration, approvals, UI and storage remain TypeScript.

The interpreter's standard library is copied to .data/native-python; the original conda environment and its site-packages are not exposed. Python is an explicit dependency. No host fallback occurs.

Strict offline requires loopback-denial preflight before executing a command. This machine fails that preflight and correctly refuses execution. File-isolation mode is usable but makes no network-isolation promise. Windows/public OS resources may remain readable.

Timeout, cancellation and stdin EOF stop the owned job. Normal completion also stops descendants. ACL/profile cleanup errors are reported. Force-killing the adapter can leave stale ACL/profile artifacts; automatic post-crash ACL garbage collection is not implemented.

This is a standalone port of the old native adapter, not pure TypeScript. It has its own runtime paths, identity namespace and cross-process setup lock. Approved host commands and MCP processes do not gain isolation from this backend.

## Writable subagents

spawn_agent accepts mode read-only (default) or isolated. Isolated mode requires a writable project. Each child receives separate folder copies; grandchildren copy their immediate parent. No hard links are used.

Copies support 10,000 regular files / 64 MB. Hidden entries and dependency/build folders are excluded; links and private storage are rejected. Missing excluded dependencies do not prove the host environment is broken. Child commands require AppContainer or Docker; the host command backend and external MCP are unavailable to children.

After a child completes:

1. review_agent_changes returns diffs, conflicts and a content version.
2. merge_agent_changes requests explicit in-chat approval, even in trusted mode.
3. The version and parent hashes must still match. Conflicts refuse integration. Binary changes require manual integration.
4. Merge intent is durable. An interrupted/partial merge is uncertain and cannot be replayed automatically.

This is not an atomic multi-file transaction. A narrow race against malicious concurrent local writes remains. Conversation forks still share project files; isolated child copies are separate and are not Git branches.

Single agent / Automatic delegation / Prefer collaboration is inherited by children. Single agent removes spawn and rejects direct delegation in the runtime. The other modes guide model decisions; they do not force trivial tasks into teams. Depth, tree-size and shared model-concurrency limits remain enforced.

## Retrieval

SQLite is authoritative for scoped documents, chunks and vectors. Below 2,000 eligible vectors retrieval uses exact cosine; larger selections use hnswlib-node HNSW in a Node worker (M=24, construction ef=200, search ef=256), combined with scoped lexical search using reciprocal-rank fusion.

Scopes, embedding endpoint/model, dimensions and database revision identify a generation. Changes invalidate it; revision changes during retrieval reject stale results. Worker failures are reported, not treated as no evidence.

One generation is cached in memory and rebuilt from SQLite after restart. Persistent ANN artifacts, per-corpus ef calibration, distributed retrieval and million-chunk performance are not implemented or claimed. Initial scoped SQLite/JSON loading is still synchronous and needs profiling for very large corpora. Native bindings need a compatible C++ toolchain for source installation.

## Interface

Automatic base text is 16-22 CSS px according to viewport width. Body text scales with it. Manual 100/115/125/150 percent choices persist locally. Physical inches and viewing distance cannot reliably be detected.

The discrete reasoning slider uses only the model's configured supported levels. It does not invent provider support. Conversation collaboration policy is beside the composer. Both controls lock during a run.

The prompt favors direct, relevant answers without mandatory headings. Runtime facts remain available for accuracy. The host does not rewrite answers into templates; a model can still add unnecessary disclaimers.

## Verification

- Native Windows test: workspace write, outside-file read/write denial and timeout passed. Strict offline correctly refused execution.
- HNSW: 15,000 synthetic 32D vectors, 12 held-out queries, recall@10 = 1.0 against exact search. This is not a general RAG quality score.
- Scope/deletion/model changes, conflicts, links, binary merges and recursive copies have regression tests.
- Real DeepSeek test: a child created answer.json; parent reviewed, obtained fixture-scoped approval, merged and read it back. Original file unchanged. The first fixture failed because the project was inside private storage; the failure was retained.
- Edge: 390/1440/1920/2560/3840 viewport widths, slider/policy persistence, manual 24px base text, math, diffs, questions and reconnect.

The checks above used local regression and integration fixtures, which are excluded from the public repository. They are bounded integration checks, not comparative capability benchmarks.


### Readiness diagnostics and blocked execution
Settings offers a fixed harmless execution readiness check using the saved backend. It does not change policy, install Docker, or prove all security properties. Docker runs use --pull=never; install the chosen image explicitly before use.
Strict-offline bootstrap reports its actual connection result and OS error code before any requested command starts. A timeout is not treated as a proven OS denial. A structured pre-command result is used to distinguish this from untrusted command output.
A proven launch failure (including missing docker executable) is recorded as not_started, not an unknown effect. Further commands in the same run and unchanged backend are suppressed after the first such failure, preventing repeated approvals. Settings changes and a new run allow another attempt. Command results identify the selected backend, shell and execution directory; no backend fallback exists.


## Runtime refinement validation (2026-09-30)

- Local regression: 70 passed, 0 failed; TypeScript check and production build passed.
- Browser integration: passed, fixture browser-ulaqQ2.
- Live model deepseek-flash: three tasks (file reads, dependency plan with evidence, scoped memory), three repetitions. Initial iteration 8/9; one response had malformed tool JSON. After bounded protocol repair, 9/9. Both local reports retained.
- Slowest final sample: 119.9 seconds. Success does not imply efficient planning.
- Embedding-index scope and invalidation were tested with deterministic vectors, not a real embedding endpoint. Live memory samples used lexical recall.
- These are integration checks, not held-out coding benchmarks or a comparative score. They do not establish a 9.5/10 rating.
- Still open: broad unseen task evaluation, independent outcome grading, efficient autonomous team scheduling, exact provider-specific token counting, learned reranking/conflict resolution, multi-provider live verification, and additional OS sandbox validation. No new Docker or strict-offline success is claimed.
- Local test code and diagnostic records remain excluded from the public repository by user preference.


## Team and evidence refinement (2026-09-30)

- Regression: 72 tests passed, including artifact-change invalidation, rejection of unrelated read evidence, stale board revisions, foreign/active owner handoff refusal and unknown-effect refusal.
- Real deepseek-flash integration: version-binding task passed in 35.2 seconds; lead plus read-only worker completed shared-task claim, read, evidence binding and lead finalization in 66.9 seconds. Local report: team-evidence-x2B17b/report.json, 2/2 cases passed. These are mechanism checks, not a broad capability benchmark.
- Browser integration passed (browser-NrfhF7); build and type checking are part of the release check.
- Handoff refusal/reassignment was tested deterministically; the live team check used real delegation but did not inject a real process crash or prove automatic scheduling.
