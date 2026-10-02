# Memory, temporal knowledge and evidence graphs

[English README](../README.md) · [中文 README](../README.zh-CN.md)

## Scope and controls

Personal chats share user memory. Project chats write only to their project memory.
Projects recall user memory only when explicitly enabled. Graph entities, aliases,
relationships and source evidence follow the same scope boundary.

Using memories and contributing memories are separate conversation controls.
Contribution is off until enabled and bound to the configured model endpoint.
Background extraction uses at most 30 recent user messages (4000 characters each)
and 80 same-scope entries, after two minutes idle with no foreground work.
It never includes tool outputs, attachments or assistant messages in that extraction
request. Endpoint changes require renewed opt-in. Failed checkpoints are not retried
in an idle loop. Sources/settings changed during extraction invalidate the result.

This follows the [public Codex memory pattern](https://learn.chatgpt.com/docs/customization/memories)
of separating contribution and recall, not its private implementation.

## Types, time and revisions

Entries distinguish preferences, decisions, episodes and experiences. Fields include
recorded time, effective interval, source conversation/event, entity/attribute/value,
revision, superseded entries and conflict IDs.

- Clear source-backed preferences can activate automatically.
- Decisions, episodes and conflicts remain candidates.
- Experience activation requires applicability conditions and existing successful
  host-observed tool evidence from the same scope.
- Experience recall rechecks evidence existence; deleting the source prevents use.
- Memories remain fallible context, never permissions or high-priority instructions.

Use **Time, sources & revisions** on an entry to edit attributes, validity and content,
inspect history, or undo the latest independent edit. Replacement is an explicit user
action: choose the winner and its conflicts; older entries retain their effective
interval for historical queries. Newer text alone does not win. Current conflicting
entries cannot be activated through the ordinary confirmation switch.

History is an audit of changes, not forensic storage. Forgetting removes the entry,
its vector and its revision snapshots; related graph edges are also removed. Content
hashes and source-event tombstones prevent exact-content and same-source regeneration,
including paraphrases extracted from the blocked event. A new independent source can
still propose similar content. Switching contribution off does not erase saved entries.

## Consolidation and entities

Background processing consolidates exact duplicates with matching entity/attribute/type.
It retains source references and revision records; it does not automatically merge
merely similar sentences. The Memory page can run this explicitly and inspect conflicts,
expired entries, duplicate entries and missing sources.

Entities have stable IDs and confirmed, scope-local aliases. Ambiguous aliases are
rejected, not merged by vector similarity. The agent can propose entities with source
quotes; these require user confirmation. The user can create entities and aliases
in the Memory workbench. The model can propose sourced relations between confirmed
entities using suggest_memory_relation.

## Evidence graph

A relationship has a direction, predicate, effective interval, revision and quoted
source evidence from a same-scope memory, document or user/tool event. The host checks
that the source exists and the quote matches; user confirmation activates it.

The workbench supports entity lookup, relation confirmation/deactivation/deletion and
time-specific path queries. search_memory_graph returns up to three hops and forty
paths, with original directed edges and sources. Traversal can discover incoming as
well as outgoing relations. Cycles are bounded and do not create recursive model calls.

Only confirmed entities and active, time-valid, still-supported edges participate.
Deleted/expired sources remove edges from retrieval. A path is an explanation of
stored relations, not a proof of causality, entailment or a newly derived fact.

## Knowledge documents

Importing a revision explicitly links it to an existing same-scope document. The old
version gets an end time, while the new document keeps family ID, version, source,
publication/effective times and source hash. Same filenames are not automatically
treated as the same document. Use **Version & citation** to paste a new version.

Chunking keeps Markdown headings and line boundaries where possible.
Oversized lines are split with overlap. Retrieval filters scope and effective time
before FTS candidate selection or vector ranking. Small vector scopes use exact
similarity; larger eligible scopes retain the existing HNSW implementation.

Results include document/version/chunk citations, headings, adjacent chunks and
alternative source excerpts. Hybrid rank fusion is followed by a lightweight heading
rerank. The interface and search_knowledge accept an optional historical timestamp.
Contradictory source excerpts must be compared; the retriever does not silently elect
a universal truth or certify the answer. Image-only PDFs still require OCR.

## Usage

1. Enable contribution on selected conversations; manage entries in Memory.
2. Use entity IDs and attributes to describe facts that can meaningfully conflict.
3. Resolve conflicts explicitly; query an earlier timestamp to inspect prior values.
4. Add named entities and aliases, then quoted relationships; confirm candidates.
5. Search entity names/aliases to inspect evidence paths.
6. Import document revisions rather than overwriting historical source material.
7. Forget entries to exclude their source events from later extraction.

Embedding indexing stays explicit. Neither consolidation nor graph creation starts
a hidden embedding upload. Graph tools and temporal recall respect conversation scope.

## Validation and limits

Regression tests exercise temporal replacement, stale revisions, exact-source forgetting,
negative experience evidence, scoped deduplication, document version filtering, aliases,
multi-hop paths and missing/deleted sources. A synthetic real-model run validates the
extraction connection; it does not measure general factual accuracy.

Exact quote matching does not establish entailment. Secret detection is best effort.
There is no calibrated confidence probability, autonomous ontology induction or
unrestricted graph inference. Graphs use local SQLite records and bounded traversal,
not a distributed graph engine. Semantic duplicate consolidation remains a review
problem rather than an automatic overwrite. Source backups and SQLite free pages are
outside application-level forgetting. Historical query times describe validity, not
a full reconstruction of what every model knew at that moment.

## Automatic management

Conversation details now offer one **Automatic memory management** switch.
It enables extraction and recall together and disables cross-project user-memory mixing.
It uses the displayed conversation model and the existing bounded human-message source
window; no tool logs or attachments are sent. Existing conversations are not silently opted in.
Switching off stops extraction and recall, including discarding in-flight extraction results.

Explicit sourced preferences, decisions and episodes activate automatically. Exact duplicates
are consolidated. A newer source can replace older automatic facts only for the same
entity and attribute; ambiguous conflicts and manually maintained facts are retained without
interrupting the conversation. History remains auditable. A sourced graph link is generated
for each active memory; this is not autonomous discovery of arbitrary causal relationships.
Expired entries are excluded by retrieval, not destructively erased. Embedding indexing and
document revision imports retain their existing separate controls; this switch does not
grant a new external embedding destination permission.

## Local bilingual retrieval and automatic knowledge maintenance

Settings offers a local CPU backend, pinned multilingual-e5-small ONNX q8, alongside the
existing OpenAI-compatible embedding API. The first local request downloads public model
weights; subsequent inference uses the disk cache. E5 query and passage prefixes differ.
Embedding, SQLite FTS and HNSW run locally; generating an answer still uses the conversation
LLM and may send retrieved excerpts to that configured provider.

In Knowledge, choose a scope, register source files/folders within its project, and enable
automatic maintenance. An empty source list indexes only explicitly imported documents.
The 30-second worker creates versions for changed content, reuses matching same-scope chunk
vectors, retires removed files, and exposes status/errors. Transient network failures retry with exponential backoff (30 seconds to one hour), including
after three failures. Configuration failures pause after three attempts until settings are saved. Changing the embedding destination
requires saving the scope setting again. Session knowledge never scans project folders.
No implicit global computer scan or attachment retention is enabled.

The scanner supports text, Markdown, CSV, JSON, DOCX, XLSX and text PDFs; it excludes hidden,
dependency and build directories and links. Limits: 12 registered paths, 1,000 supported
files, 10,000 visited entries and 25 MB per source. Narrow the source set if a limit is hit.
Images and scanned PDF pages use local Windows OCR during automatic maintenance. OCR requires
installed Windows language packs, is fallible, and scanned pages are limited to 50 per PDF. File history remains until explicitly
removed. ANN uses local HNSW at 2,000 eligible vectors, exact similarity below that threshold.
The ANN algorithm is language-independent; semantic bilingual quality depends on E5.

Automatic memory management also indexes newly learned active memories locally when the
local embedding backend is selected. Remote memory indexing retains explicit control.

Local smoke evaluation (2026-10-02): real CPU q8 vectors had 384 dimensions;
3/4 tiny bilingual/cross-language queries ranked the intended passage first. The Chinese
refund query ranked the English refund passage third, behind two unrelated Chinese texts.
This is a known quality limitation, not a passed semantic benchmark. HNSW returned the
same nearest neighbors as exact similarity in this probe. Production retrieval returns
multiple cited candidates; this is not evidence of high recall on a large corpus.
Model download is resumable and the pinned ONNX weights are SHA-256 checked before loading.

## Scope defaults, background work and evidence-based adaptation

The Memory page stores separate defaults for ordinary chats and each project. New chats
inherit only the authorized model destination; chat overrides are preserved. Existing chats
are not silently opted in. Switching model destinations requires a new explicit selection.

Background work lists indexing, memory, graph extraction, command jobs, team work, dependency
preparation and schedules. Schedules persist a dispatch identifier before starting a run.
They support one-shot/repeating prompts and completion of a command in the same conversation.
The service must remain running. Missed intervals coalesce, runs do not overlap within a chat,
and failed/interrupted runs or uncertain effects require inspection rather than blind replay.
External CI/webhook subscriptions are not implemented by this scheduler.

Disputed automatic memories are reconsidered when new extraction provides evidence; explicit
newer same-attribute user statements can supersede old automatic records. Ambiguous identity
or conflicting manual records remain quarantined. This does not autonomously research the web.

Optional document relationship extraction requires explicitly selecting a model destination.
It processes at most eight chunks / 14,000 characters per document. Labels and relation phrases
must appear in source quotes; exact same-scope entities are reused across documents. Ambiguous
aliases are rejected. Retired or deleted sources stop supporting retrieval. Literal quotes
prove provenance, not entailment: these are sourced assertions, not independently verified facts.

Retrieval feedback lets users mark a document as the correct source for a query. Maintenance
compares lexical and hybrid retrieval using those labels; at least 15 cases and five held-out
cases with a 0.1 MRR improvement are required for automatic strategy selection. Agent-authored
labels are excluded. This is bounded strategy selection, not automatic model, reranker or
chunk-size search. Small sets and repeated feedback are not a generalization benchmark.

The prepare_skill_environment tool creates reusable project-local pip/npm environments through
normal command approval and sandbox enforcement. npm lifecycle scripts are disabled. It checks
dependency consistency, not full skill behavior. Missing credentials, account connections and
ambiguous/failed installations still require appropriate user action.

## Recovery assistance

Background failures now show a classified cause and a repair action. Temporary connection
failures use backoff. Authorization, missing dependencies, capacity limits and unknown outcomes
are not treated as transient network problems. A changed saved credential triggers another
indexing attempt only when the destination and scope still match the previous authorization.
The stored recovery marker is a digest, never a credential. The worker checks every 30 seconds.

After fixing local configuration or dependencies, **Recheck after repair** resets only failed
index attempts in that enabled scope. It cannot enable a disabled scope or authorize a new
embedding destination. Completed index jobs are retained.

Failed skill preparation is recorded even when command invocation throws. **Ask Agent to
diagnose and repair** opens work in the original conversation. The agent first inspects the
environment, then uses the existing command approval and sandbox flow. Repeated clicks for
the same failure reuse the dispatched run. Repair assistance is a new diagnosis, not a replay
of the failed install. Credentials and account connections are not automatically acquired;
the host does not claim the skill is ready until dependency preparation reports success,
and end-to-end behavior still needs verification.

## Persistent ANN cache

Large-corpus HNSW indexes are cached beside the database under ann-cache (up to four binary
generations plus manifests). Keys include candidate IDs and vector contents, in addition to
scope/model generation. Reload verifies the binary SHA-256, dimensions and IDs; corruption
rebuilds the derived cache. Empty candidate sets never reuse old neighbors.

Each build/load probes up to four synthetic vector mixtures against exact top-10 similarity.
Below 95% sampled recall, ef rises from 256 to 512/1024; continued failure selects exact search.
This calibrates approximate-neighbor fidelity, not semantic relevance, truth or confidence.
Retrieval diagnostics expose cache source and calibration. This is a bounded engineering smoke
check, not a representative large-corpus benchmark.

Caches are local derived data and can include embeddings of recently retired documents until
generation eviction. Eligibility filtering and content keys prevent their return to current
retrieval. Deleting source records is not forensic erasure of cached files or database backups.

### Folder import

In Knowledge, select a **project** scope, then use **Folder import and automatic
maintenance**. Paste up to 12 absolute source paths (one per line), choose folders
with the system picker, or add the project's folders. Enable and save the scope.
Subfolders are scanned recursively every 30 seconds, with content hashes avoiding
repeat imports. The UI shows supported-file, updated and unchanged counts.
Only supported document formats are parsed; hidden entries, dependency/build
folders and symbolic links are skipped. Limits are 1,000 supported files,
10,000 scanned entries and 25 MB per file. Errors are visible.
Folders must belong to the chosen project; register additional project roots
first. A conversation library accepts uploaded documents, not arbitrary host
folder paths. Local embedding keeps document content local; external embedding
uses the destination disclosed when enabling maintenance.
