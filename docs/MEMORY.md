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
