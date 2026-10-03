# Folder import and failure isolation

Folder watching has no fixed byte-size, file-count, directory-entry or PDF-page-count ceiling.
Only explicitly authorized roots are traversed. Hidden/build entries, symbolic links and unsupported formats remain excluded and counted.

Each changed source is hashed through a stream, parsed sequentially in a separate process, and checked again before import. PDF text is extracted page by page (including pages after 500), with page resources released. Scanned pages use OCR; there is no 50-page cutoff. Extracted text keeps page labels for citations.

This is not unlimited resource consumption: the parser uses a 768 MB V8 heap setting and a 120-second per-file timeout. Native-library memory is not covered by the V8 heap limit. Extraction is rejected above 5 million characters, rather than silently truncated. Large or expensive files that hit these protections need splitting; automatic resumable PDF segmentation is not implemented. The web attachment upload limit is separate and unchanged.

Parse failures are recorded per file and do not block siblings. Unchanged failed bytes are retried at most three times; changed bytes or the existing Save sources / retry action reset attempts. Successful unchanged sources are reused. Incomplete traversal never retires unseen documents. A changed source that fails parsing retires its stale indexed version. Index/graph errors are separately reported and retain network retry/credential-recovery behavior.

The UI shows partial completion, individual errors and excluded-entry counts. Empty tool searches include scope-limited diagnostics distinguishing disabled knowledge, no imported documents, import failure and no matches. Chat history is not automatically a knowledge document.

Regression coverage includes corrupt-file isolation, retry/reuse, more than 1,000 sources, and a real PDF larger than 25 MB with 501 pages whose final-page text must be recovered.

## Visible progress and incremental updates

Maintenance publishes its current stage, file, elapsed time and processed counts. Scanning and retrieval evaluation have indeterminate progress; parsing and indexing use separate denominators, not an invented overall time estimate. Vector status counts persisted chunks for the currently selected model. Progress polling does not replace an edited folder draft.

Adding a folder within the same scope preserves source identities and content hashes. Unchanged successful documents are not reparsed and completed vector jobs for the same model are reused. Moving a file or changing scope creates a different source identity; changing embedding models requires new vectors.

The scope-level batch indexing button queues a durable background job for current document versions without enabling folder watching or graph extraction. Jobs reuse existing vectors, remain scope-bound, and refuse to continue after an embedding destination change. The ordinary automatic-maintenance mode already indexes imported documents; manual batch indexing is a repair/one-shot alternative.
