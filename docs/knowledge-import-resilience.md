# Folder import and automatic maintenance

[English](knowledge-import-resilience.md) | [简体中文](knowledge-import-resilience.zh-CN.md) · [Documentation](README.md)

Reviewed: 2026-10-05; code baseline: `d663030`.

## Configure

Choose All general chats / shared library, a project, or a private conversation scope. Shared general folders do not grant chat command access; projects never implicitly read the general library. Project folder sources must belong to registered project roots. Private conversation scope supports imported documents, not arbitrary host folder scans.

Register up to 12 source paths, choose embedding, optionally authorize graph extraction, then enable/save maintenance. The 30-second worker handles subsequent changes. Local E5 keeps embeddings local; remote embedding and graph extraction disclose their separate destinations. Adding folders does not reparse unchanged successful documents; hashes are checked, same-model vectors reused. Moved files or changed scope have new identities.

## Parsing and limits

There is no fixed supported-file count, visited-entry count, single-source byte size or PDF-page ceiling. Hidden/build/dependency entries, links and unsupported formats remain skipped and counted.

Supported documents include text, Markdown, CSV, JSON, DOCX, XLSX and text PDFs. Images/scanned pages use local Windows OCR with installed language packs. PDFs extract page by page, including beyond page 500, preserving page labels.

Parsing is sequential per changed source in a separate process, with a 120-second timeout, 768 MB V8 heap and 5-million-character extracted-text limit. Native memory is not bounded by V8. Excessive extraction fails visibly rather than silently truncating. Very expensive files still need splitting; resumable automatic PDF segmentation is not implemented. Attachment upload limits are independent.

## Failures and versions

Each file fails independently. Unchanged failed bytes get at most three parse attempts; changed bytes or Save sources / retry resets them. Transient indexing/network failures use backoff; configuration errors pause and can resume after matching repairs. A failed changed source retires the stale indexed version. Incomplete scans never retire unseen files.

Progress reports stage/file/elapsed/counts. Scan/evaluation can be indeterminate; each stage has its own denominator, not a promised ETA. The panel and progress load separately from vector statistics; edited drafts are retained.

Automatic maintenance indexes imported documents. Batch fill indexes is a one-shot repair for current-scope versions, reuses completed vectors and refuses a changed destination. It does not implicitly enable watching or graph extraction.

Empty searches distinguish no matches, disabled scope, no documents and import failure. Chat history itself is not a knowledge document. See [memory and retrieval](MEMORY.md).
