# AgentDemo

A local-first, practical agent application written in TypeScript. Node.js 24, React, Fastify and SQLite. English source and documentation; English / Chinese interface.

This is a separate application. It does not modify Agent4Learning, use its chat history, or include its teaching labs.

## Start

On this Windows machine, double-click **Start-AgentDemo.cmd**. Open **http://127.0.0.1:8810**.

The launcher finds Node.js 24+, starts a hidden supervisor, and opens the browser. Its temporary PowerShell execution-policy override applies only to the launcher process; it does not change system policy.

For another machine:

```sh
corepack pnpm install
pnpm build
pnpm start
```

For development, run `pnpm dev` and `pnpm web` in two terminals. Vite serves port 8811 and proxies the local API on 8810. The core application uses Node.js. The optional Windows AppContainer backend additionally requires a configured Python interpreter.

## Everyday workflow

1. Add a model connection in **Settings**. Configure the protocol and endpoint explicitly; test it before use. Existing keys are never returned to the browser.
2. Start a personal chat, or add a **Project** with one or more absolute folder paths. Personal chats have private artifact storage and cannot execute project commands.
3. Choose a model, reasoning level, permissions and optional skills in the chat inspector.
4. Drop a document or image into the composer. Use **Knowledge** to index documents under a specific project or conversation.
5. Send follow-ups while a task runs. Questions and approvals appear where they occurred. Denial returns a result to the agent; approval continues the same task.
6. After an interruption, continue chatting in read-only inspection mode. Use automatic outcome checks or explicitly allow another attempt; unknown operations are never silently replayed.

Plain answers can finish directly. There is no required `finish` tool or fixed “round summary” heading.

## Included

- Token-streaming chat; Markdown, code copying, message feedback, pinned/archived chats, conversation branches, turn navigation and collapsed activity previews.
- Durable conversations, run checkpoints, tool effects and API usage in SQLite.
- An explicit run lifecycle, cancellable model concurrency pool, queued steering and durable user-input requests.
- Native wire adapters for OpenAI-compatible Chat Completions, OpenAI Responses, Anthropic Messages and Gemini. Provider reasoning/signature blocks are retained across tool calls.
- Adjustable supported reasoning levels, configurable context/output limits, model discovery and API-calibrated token-budget compaction.
- File tools, exact-match edits, bounded spills, DeepSeek native web search, public-URL fetching, explicit command approvals, Windows AppContainer and Docker command backends.
- Recursive read-only or isolated writable subagents with depth/tree limits, shared model concurrency, scoped knowledge, messages, waiting and cancellation propagation.
- YAML-aware skill directory import, namespaced identities, multiple selected skills and supporting-file reads.
- Project/session knowledge with SQLite FTS5 retrieval, optional embedding indexing and hybrid ranking. Text, CSV, DOCX, XLSX and text-based PDF extraction; images are passed to a vision-capable model.
- Confirmed user/project memories with relevance-based recall, explicit semantic indexing, inactive suggestions, revision/model invalidation, expiration and deletion.
- Optional shared task DAG with dependencies, optimistic ownership updates, member discovery and audited handoff after worker exit.
- Version-bound file/check observations with stale-evidence detection; author completion remains distinct from independent review. Plain answers still finish directly.
- Bounded parallel observational file reads, serial mutation barriers and result-aware repeated-trajectory detection.
- Explicitly enabled local stdio MCP servers; each MCP operation still requires user approval.
- A local supervisor with bounded crash restart. Interrupted tasks are recovered as interrupted, never silently replayed.

## Deliberate boundaries

**A project is not a sandbox.** The default command backend executes a host process after approval. It can access host-user files and network. Its working directory is not an access boundary. Docker mode is an actual separate execution backend with network disabled; it requires Docker and a prepared image and never silently falls back to host execution.

Windows AppContainer is available through a small standalone Python adapter. It requires an explicit Python path and never falls back to host execution. Strict offline performs an OS preflight; file-isolation mode does not promise network denial. See [migration details and tested boundaries](docs/MIGRATION.md).

Conversation branches copy context and share project files. Separately, isolated writable subagents use independent folder copies, versioned diffs, conflict checks and explicit approval before merging. Interrupted merges are never automatically replayed.

Optional hybrid retrieval uses exact cosine for small scopes and HNSW in a Node worker for 2,000+ eligible vectors, with scope/model/revision invalidation. Indexes rebuild from SQLite after restart. Embeddings send text to the configured endpoint when indexing or querying; native HNSW installation requires a compatible build environment.

Scanned PDFs need OCR outside this application; image attachments need a vision model. There is no fabricated OCR output. Skill scripts need an appropriate execution environment and command approval.

“Completed” means the run produced a final answer and its children finished. It is **not a blanket independent-verification certificate**. Tool outputs and failures remain visible. API token counts are measured when supplied by the provider; configured prices yield an estimate, not a provider invoice. Missing prices remain unknown.

## Build checks

```sh
pnpm check
pnpm build
```

This public repository contains application code and runtime launchers. Private test suites, live API probes, diagnostic artifacts and local verification utilities are deliberately excluded; they remain in the development workspace. Build checks are not an independent security certification.

See [architecture](docs/ARCHITECTURE.md), [interaction](docs/INTERACTION.md) and [security](docs/SECURITY.md).

## Data

Private state: `.data/`. Test artifacts: `.diagnostics/`. Both are excluded from Git. API keys are currently stored in a local settings file, not an OS credential vault. Protect the machine account and this directory. Exporting a repository must not include these directories.

Skills are referenced from the imported directory; keep that directory available. The application does not install missing packages or external tools without a command request and user authorization.

### Automatic team workload assignment

The lead can enroll existing workers with `configure_team_scheduler`. Ready tasks are selected by priority and assigned to eligible workers with the lowest weighted task load. Task weights and each worker's configured capacity are explicit; this is task scheduling, not CPU telemetry or a claim of optimal delegation.

Workers can call `await_team_task` to wait for up to 60 seconds without repeated model requests. The team panel displays scheduling status and each enrolled member's weighted load. Assignments are persisted in an audit record.

Permissions remain unchanged. Waiting-for-approval/user, recovery-only and uncertain-effect workers are excluded. Failed or blocked tasks are not automatically replayed. The scheduler does not spawn, resurrect or resize workers. Independent writable tasks require writable isolated copies; dependent writable work remains lead-managed because an existing copy may be stale.

Validation: one real-model run distributed two independent reads across two workers and completed in 61 seconds. This establishes the exercised path, not a statistical performance claim.
