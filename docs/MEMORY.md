# Memory, knowledge and retrieval

[English](MEMORY.md) | [简体中文](MEMORY.zh-CN.md) · [Documentation](README.md)

Reviewed: 2026-10-05; code baseline: `d663030`.

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
