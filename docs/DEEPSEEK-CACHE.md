# Prefix cache and token efficiency

[English](DEEPSEEK-CACHE.md) | [简体中文](DEEPSEEK-CACHE.zh-CN.md) · [Documentation](README.md)

Reviewed: 2026-10-05; code baseline: `d663030`.

Amadeus uses provider-reported prompt caching, not locally stored KV tensors. Official DeepSeek routes normalize tool/schema object ordering while preserving array order. Authorization and changed instructions take precedence over prefix stability; compatible third-party gateways are not assumed to implement identical semantics.

## Layers

- Stable system/environment fields precede changing facts and actions.
- Fresh file reads may use retained-base references/diffs, with hash checks and full fallback.
- Compaction preserves source records and task snapshots; it can discard transport redundancy, not silently drop requirements.
- Diagnostics distinguish equal text from same-route/reasoning/tool reuse conditions. Neither guarantees a remote hit.
- Review requests have a separate stable prefix and narrowly scoped in-flight deduplication; no completed approval grant is cached.

Measured cached input is a subset of total input. Missing usage remains unknown. USD is estimated from configured prices; a token usage response is not a per-request invoice. Price schedules are not automatically fetched. Self-hosted KV persistence requires a separately deployed engine/protocol; it is not available through this application's DeepSeek cloud adapter.

## Recorded probes

On 2026-10-04, two synthetic requests used 2,974 input/1 output tokens each; cache counts were 0 and 2,816 (94.7%), first text at 1,649/1,512 ms. A separate two-review probe used 1,118 input tokens each, cached 512/896, with durations 1.896/3.322 s. No private source was used or reviewed command executed.

These are small integration observations, not causal latency or representative savings results. [Paired context probes](../evals/context-control/README.md) and [coding pilot](../evals/coding/README.md) did not establish optimization gains. Cross-user sharing, speculative paid warming and replay of old answers/tool effects are not enabled.
