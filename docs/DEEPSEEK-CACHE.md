# DeepSeek prompt caching

Amadeus uses DeepSeek's automatic provider-side prefix cache. It does not hold,
export or restore KV tensors. No cache-control flags are invented, and no
application result cache substitutes old model answers for new requests.

For official api.deepseek.com Chat Completions and Responses connections, tool
names and JSON schema object keys are serialized deterministically. Array order
is preserved, schemas are not mutated, and authorization still controls which
tools are available on each request. Other compatible endpoints are not assumed
to implement DeepSeek's protocol. Stable instructions remain ahead of changing
runtime context; changing permissions or instructions takes priority over cache reuse.

Diagnostics distinguish identical message prefixes from local reuse conditions
(same route, reasoning settings and tool schemas). Neither proves that the provider
still holds a cache entry. Actual cached tokens come from API usage. Reasoning
configuration changes also invalidate local token calibration.

## Validation

On 2026-10-04, two synthetic deepseek-flash requests each used 2,974 input tokens
and one output token. API-reported cache hits were 0 and 2,816 (94.7%). The second
request deliberately reordered tools and schema keys before normalization.
First text arrived after 1,649 ms and 1,512 ms respectively.
This is a two-request integration smoke test, not evidence of causal latency
improvement or a representative savings rate. No project content was transmitted.

## Costs and limits

DeepSeek's documented usage fields report input, output and cache hit/miss tokens,
not a per-request currency charge. Amadeus calculates estimated USD from measured
usage and configured prices; unknown prices remain unknown. This change does not
automatically fetch prices or handle public-holiday peak pricing. Check the pricing
page before configuring rates. Account balance changes are not safe per-request
billing evidence when other requests may be concurrent.

Self-hosted KV persistence needs a separately deployed inference engine and its
documented cache/session protocol. It is not available through the DeepSeek cloud
API. Cross-user content sharing, extra cache warming requests and silent replay of
model/tool results are not enabled.

Sources:

- https://api-docs.deepseek.com/guides/kv_cache/
- https://api-docs.deepseek.com/api/create-chat-completion/
- https://api-docs.deepseek.com/quick_start/pricing/
