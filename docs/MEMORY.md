# Memory, knowledge and retrieval

[English](MEMORY.md) | [简体中文](MEMORY.zh-CN.md) · [Documentation](README.md)

Reviewed: 2026-10-06.

## Managing recall scope

Storage scope (general conversations or one project) is separate from recall scope (original conversation only or shared in that storage scope). Search by conversation title, filter by original chat and recall scope, or jump to the current conversation. Manual creation is optional and preselects the current eligible original chat; worker chats and other projects are excluded.

Select any number of matching entries and apply **original chats only**, **share within scope**, or **restore automatic scope** in sequential batches. Each local entry keeps its own source chat; changing reach never rewrites provenance or activates a candidate/disabled memory. Stale revisions and conflicting active facts fail individually. Entries without a recorded original chat cannot be explicitly restricted to one.

Automatic scope follows kind: episodes and general-chat decisions remain local; preferences, experiences and project decisions are shared in their storage scope. Explicit overrides remain until reset. The effective scope is shown during creation. A local manual entry requires a same-scope original conversation. Existing records are not mass-migrated or automatically broadened by this UI change.

## Scopes and opt-in

Ordinary conversations share user memory; each project has its own memory. Automatic management keeps project/general scopes separate; deliberate user-memory mixing is a separate choice. Scope defaults apply to new conversations, with per-chat overrides. Existing chats are not silently opted in. Changing the extraction destination requires renewed authorization.

Automatic management enables extraction and recall. Extraction uses up to 30 recent human messages (4,000 characters each) and 80 same-scope entries after two idle minutes; it excludes assistant/tool text and attachments. Disabling discards in-flight results. Clear sourced preferences, decisions and episodes can activate; ambiguous conflicts/manual records are not blindly overwritten. Experiences need applicability and same-scope successful host evidence.

## History and graphs

Entries carry effective time, source, revision and optional entity/attribute/value. Exact duplicates consolidate; explicit newer same-attribute automatic facts may supersede older automatic records. New evidence can reconsider disputes. Similarity alone cannot resolve identity or truth.

Confirmed aliases and source-backed directed relations support bounded temporal graph search (up to three hops/40 paths). Source quotation matching proves provenance, not entailment or causal truth. Expired/deleted/retired support is excluded. Forgetting removes application entries, vectors and revision snapshots and blocks regeneration from that source; it is not forensic erasure of backups or SQLite free pages.

Optional document graph extraction uses the selected model destination, up to eight chunks/14,000 characters per document. Labels/relations must appear in quotes; exact same-scope entities can be reused, ambiguous aliases rejected. This is bounded extraction, not unrestricted ontology learning.

## Knowledge and versions

General chats can use a shared library plus their private session documents. Projects never automatically include the general library. Delegated work inherits authorized parent scopes; child chats are not ordinary scope-picker entries.

Import uploads or register folder sources. Automatic maintenance creates content versions, preserves citations, retires missing/invalid old sources and reuses unchanged documents. Private session uploads are not automatically shared. Same filenames at unrelated paths do not imply a revision. See [folder import](knowledge-import-resilience.md).

## Embeddings and ANN

Choose local multilingual-e5-small ONNX q8 (384 dimensions) or a compatible embedding API. Local model weights download initially, then use a verified disk cache. E5 uses distinct query/passage prefixes. Local extraction/embedding/retrieval does not make answering local: retrieved excerpts may reach the conversation LLM. Remote indexing sends authorized chunks/queries to its selected endpoint.

FTS and vector candidates combine with reciprocal-rank fusion and heading reranking. Under 2,000 vectors, similarity is exact; larger eligible sets use HNSW. SQLite is authoritative. Up to four derived ANN generations persist with content/scope/model keys and verified hashes. A small exact-neighbor calibration can raise ef from 256 to 512/1024 or fall back to exact. This measures approximation fidelity, not semantic quality.

Automatic local memory indexing and authorized document maintenance do not require clicking each document. Batch indexing repairs current-scope gaps. Destination changes require renewed scope selection. Remote memory indexing retains explicit control.

## Recovery and quality

Transient failures back off; configuration failures pause after three attempts. Same-destination credential changes or Recheck after repair can retry safely. Failed installs receive diagnosis through normal approval, not automatic replay.

User-labelled retrieval examples can compare lexical/hybrid strategies; selection requires at least 15 cases, five held-out cases and 0.1 MRR gain. Agent labels are excluded. This does not automatically search new models, rerankers or chunk sizes. A historical four-query E5 smoke test ranked 3/4 first and exposed a cross-language error; it is not a large-corpus quality claim.

## Managing a growing memory list

The library defaults to current entries and separates active, candidate and explicitly deactivated, disputed and historical/expired states. Search content, topic or source; pages contain 25 records. Select a page or individual records, then confirm, deactivate or forget any number of explicitly selected entries (sent sequentially in requests of 100). Forgetting asks for confirmation and uses existing source-exclusion semantics. Every item checks scope and revision independently; a failed item does not undo successful items. Conflicting, expired or superseded records cannot be bulk-approved.

Ambiguous conflicts have a visible count and direct review filter, with competing content and sources. They remain outside recall until resolved. No automatic interruption or automatic choice of winner is introduced.

Opted-in background learning now processes new user messages after the last successful extraction, in batches of up to 30, instead of repeatedly extracting the same recent history. Existing same-scope structured attribute/value matches are reused. Exact duplicate candidates can be consolidated without activating them; source/revision history remains. Old candidates can be reviewed against sources when their original conversation is opted in, never blanket-approved. Use the existing scope default to enable automatic management for new/inheriting chats; chat-level overrides and project/general isolation remain. No new external destination is authorized by these changes.

## Recall reach and decay

Storage scope, recall reach and decay are independent. Episodes and general-chat decisions default to their original conversation; preferences and project decisions default to their existing user/project scope. New suggestions record the source conversation. Structured legacy references provide a fallback. Unknown-source local entries are not recalled. Sharing a local record requires a user edit and never crosses projects. Starting a new conversation excludes another conversation's local episodes; switching tasks within the same conversation does not automatically infer scenario boundaries.

Automatic decay keeps preferences, project decisions and verified experiences stable. Episodes/general-chat decisions use weight = 0.5^(ageDays/30 + laterUserTurns/100), floored at 0.05. Users may override stable, time-only, turns-only or combined policies and half-lives. Tools, token volume and memory reads neither count as turns nor refresh age. Missing activity evidence contributes no turn penalty. This affects ranking, not truth or deletion; explicit expiry still excludes records.

Classification uses the extractor's generic memory kind, not topic keywords. Misclassified legacy entries may need correction. Deployment does not trigger paid historical reclassification or destructive cleanup.

## Readable graph management

System memory:<id> nodes represent provenance, not people or concepts. The UI hides them by default and displays memory summaries when shown. Advanced creation controls are collapsed; relations support search and pagination. Revisions update system-owned source quotations, deactivation retires those links, retrieval checks expiry, and forgetting removes unreferenced internal nodes. Unrelated domain edges are never rewritten automatically. Missing/invalid evidence is visibly marked and excluded from current traversal. Source links do not imply semantic entity resolution or factual inference.

The memory list shows source conversation titles where available, dates, reach and decay rules. Raw IDs/revisions remain under technical details. Scope search without a conversation context excludes local records; these remain visible in management and recallable in their original conversation.

Enabled means eligible for retrieval, not included in every prompt or verified as true. Scope, relevance, expiry and decay determine actual recall. Manual confirmation enables a candidate; reactivation enables an explicitly deactivated memory. Legacy inactive candidates without clear lifecycle metadata remain candidates rather than guessing their intent.

## Automatic review of existing candidates

The original conversation must be unarchived, idle and opted into automatic memory using its authorized model connection. Old candidates can then be reviewed, up to 8 per request with corresponding original human messages of up to 12,000 characters each. Attachments and tool output are excluded. Review uses model quota. Unchanged versions/source/model/active-set fingerprints are not repeatedly reviewed; failed or interrupted calls are not blindly replayed.

The host checks exact source quotes, revisions, permission, expiry, conflict and experience evidence before activation. Disabled, disputed, historical, expired and forgotten entries are not revived. Untraceable sources remain manual. Changes to source/model/active memories can trigger reconsideration. Activation permits relevant recall, not proof of truth. Enabling another conversation does not approve every project candidate. No extra dependency or first-start change is needed.

## Applicability and scoped exceptions

Recall includes applicability conditions, matching signals and explicit same-key conflicts. Relevance is not a calibrated truth probability. For an exact structured entity/attribute/condition match, conversation-local or project-specific records can shadow a broader preference in the returned context without deleting or modifying it. Different conditions remain separate and must be checked against the current request. Same-priority conflicting values remain visible rather than silently choosing one. Scope authorization, source checks and expiry run before this selection; user preferences are not automatically enabled for projects.
