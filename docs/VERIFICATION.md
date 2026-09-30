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
