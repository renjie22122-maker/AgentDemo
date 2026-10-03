# AgentDemo

[English](README.md) | [简体中文](README.zh-CN.md)

A local-first AI workspace for conversations, coding, research and creative work. Connect your preferred models, work with project files, and bring skills, knowledge and agent teams into the same chat.

Built with **TypeScript, Node.js, React, Fastify and SQLite**. The interface supports English and Chinese, adjustable text size and a configurable assistant name.

## Features

- **Chat and projects** — personal conversations, multi-folder projects, attachments, searchable skills, conversation branches and copyable code blocks.
- **Model connections** — OpenAI-compatible Chat Completions, OpenAI Responses, Anthropic Messages and Gemini adapters, with model discovery and supported reasoning controls.
- **Live task visibility** — streaming responses, collapsible steps, task progress, file diffs, API usage and context-compaction details.
- **Tools and teams** — file editing, commands, web search/fetch, image reading, background jobs and collaborative agents with isolated writable copies.
- **Knowledge and memory** — scoped document retrieval, optional embeddings and background memory extraction from opted-in conversations.
- **Media and voice** — configurable image, video, music, 3D, transcription and speech services. Dictation inserts editable text into the composer.
- **Access controls** — read-only, manual or assisted approval, plus selectable host, AppContainer and Docker execution backends.
- **Local persistence** — conversations, task state and operation records survive restarts; uncertain operations are not silently replayed.

## Quick start

### Requirements

- **Node.js 24 or newer**
- **pnpm** (or Corepack with pnpm available)
- An API connection for the model you want to use

Some dependencies include native modules. If installation reports a native build failure, install the compiler/build tools required for your platform and retry.

### Install and run

```sh
git clone https://github.com/renjie22122-maker/AgentDemo.git
cd AgentDemo
corepack pnpm install
corepack pnpm build
corepack pnpm start
```

If Corepack is unavailable, install pnpm and use `pnpm` in place of `corepack pnpm`.

Open **http://127.0.0.1:8810**. In **Settings**, add a model connection, enter its endpoint and API key, and test the connection.

On Windows, install Node.js 24+ (including npm), extract the complete repository, then double-click **First-Start-AgentDemo.cmd**. It installs locked dependencies and builds the UI before starting. You do not need to install Corepack or pnpm globally. Network access is required during setup; native build errors may require Python and Visual Studio C++ Build Tools. Rerunning First Start preserves your data.

For later launches, double-click **Start-AgentDemo.cmd**; it also runs setup automatically when dependencies are missing. It starts the local supervisor and opens the browser. The launcher uses a process-only PowerShell execution-policy override; it does not change system policy.

## Using AgentDemo

1. **Choose a conversation or project.** Personal chats keep their own attachments and artifacts. Add a project to work with one or more local folders.
2. **Choose a model and access mode.** Set reasoning, collaboration and execution permissions near the composer. Available reasoning levels depend on the model.
3. **Add context.** Drop files into the composer, select skills, or add documents to Knowledge.
4. **Send a task.** Follow progress, inspect changes and answer questions or approvals in the conversation. You can send follow-ups while work runs.
5. **Review the result.** Expand tool output and file diffs when needed. For interrupted operations, inspect recorded outcomes before retrying.

Personal chats cannot execute project commands. Select a project when the task needs local command execution.

### Conversation formatting

Replies support tables, highlighted and collapsible code, math, named quotations and opt-in interactive HTML previews. Generated media stays with its originating task. The dictation microphone sits beside Send. See [formatting and media](docs/CHAT-FORMATTING.md) for syntax and preview boundaries.

A reproducible [coding evaluation pilot](evals/coding/README.md) runs the production Runtime with independent grading. Its first 20 synthetic runs passed; they did not trigger context reuse or compaction and do not establish an optimization benefit or a real-repository benchmark score.

### Manage workspaces

Use the **…** button beside a project in the sidebar to rename it or add/remove folders, including folders in different locations. On Windows, **Browse folders in Windows Explorer** opens the modern Windows folder picker with Ctrl/Shift multi-selection; repeat to add folders from other locations, or paste one absolute path per line. Up to 12 non-overlapping folders are supported.

**Remove Project** disables the workspace without deleting disk files, conversations, knowledge or memories. Find removed projects in the sidebar archive view and save their settings to restore them. Their memory scope stays separate. Stop active project tasks before changing folders or removing a project.

### Delete a conversation

Open the conversation menu and choose **Permanently delete**. Type its exact title in the second confirmation dialog. This removes the chat, its agent children, run records and exclusive local attachments/artifacts. Independent branches, saved memories and project files remain. Stop active tasks and background operations first. Deletion cannot be undone in the app; it is not forensic erasure of backups or SQLite free pages.

### Skills

Import skill directories in the Skills library. Search and filter by source or category, then select or clear skills in bulk. Optional AI classification previews categories before you apply them.

The agent can discover enabled skills and copy supporting scripts/assets into the task workspace. Skills do not install their dependencies or grant permissions automatically.

### Knowledge and memory

Use **Knowledge** for source documents such as manuals, specifications and datasets. Retrieval follows the configured project/conversation scope. Embedding indexing is optional and sends text to the configured embedding service.

Use **Memory** for lasting preferences and decisions. Conversation details have separate controls for using existing memories and contributing new ones:

| Conversation  | Saves to              | Recalls by default    |
| ------------- | --------------------- | --------------------- |
| Personal chat | Shared user memory    | User memory           |
| Project chat  | That project's memory | That project's memory |

Projects can explicitly opt into recalling user memory. Project memories are not shared across projects or recalled by personal chats.

Memory generation is off until enabled for a conversation. During idle time, it sends up to 30 recent user messages and 80 same-scope memories to that conversation's configured model endpoint. Clear, nonconflicting preferences can activate automatically; decisions and conflicts await confirmation. View and delete entries in Memory. See [memory controls and data flow](docs/MEMORY.md).

Memory management also supports effective dates, explicit conflict replacement, revision history,
source-level forgetting and evidence-gated experiences. The workbench manages confirmed entity
aliases and source-backed relationships, and queries up to three hops at a chosen time.
Knowledge documents can be imported as new versions; retrieval returns versioned citations
and neighboring passages. See [memory and evidence graphs](docs/MEMORY.md).

### Media services

Configure media providers separately from the chat model. Adapters include OpenAI-compatible services, fal.ai, Replicate, Gemini, ElevenLabs, Deepgram, AssemblyAI, Meshy, Tripo and MiniMax.

Available operations depend on the selected model and your provider account. Configure the actual model ID and required options. Provider support does not mean every model has been tested. Generation may incur separate charges; displayed estimates are not invoices. Voice input currently uploads a completed recording for transcription, rather than providing realtime voice conversation.

## Execution and approvals

Choose isolation and approval separately: approval decides whether an operation may start; the execution backend determines its operating-system boundary.

| Backend                       | Behavior                                                                          | Requirements                                  |
| ----------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------- |
| Host approval                 | Commands run with the host user's permissions                                     | No extra runtime                              |
| AppContainer · file isolation | Windows file isolation with network access allowed                                | Windows and a configured absolute Python path |
| AppContainer · strict offline | File isolation and network-denial preflight; refuses execution if the check fails | Windows and a configured absolute Python path |
| Docker · offline              | Container execution with network disabled                                         | Docker and a prepared image                   |

**A project folder is not a sandbox.** An approved host command can access files and network beyond that folder. Assisted approval asks a separate model to review requests and falls back to you when necessary; it does not change isolation or guarantee risk detection.

See [security](docs/SECURITY.md) and [execution backends](docs/MIGRATION.md) for configuration and limitations.

## Local data

Conversations, settings and runtime records are stored locally. External model, embedding, search and media calls send the inputs needed for those operations to the configured services.

- `.data/`: private application state; excluded from Git.
- `.diagnostics/`: local diagnostic/test artifacts; excluded from Git.
- Windows API-key storage uses current-user DPAPI. Other platforms use permission-restricted local files.
- Keep imported skill source directories available.

Back up private state before moving installations. Do not include it when sharing the repository.

## Development

Run these in separate terminals:

```sh
corepack pnpm dev
corepack pnpm web
```

The backend listens on **8810**; Vite serves **8811** and proxies API requests.

```sh
corepack pnpm check
corepack pnpm test
corepack pnpm build
```

| Directory           | Purpose                                                  |
| ------------------- | -------------------------------------------------------- |
| `src/`              | React interface                                          |
| `server/core/`      | Runtime, lifecycle and orchestration                     |
| `server/providers/` | Model protocol adapters                                  |
| `server/tools/`     | Tool definitions and handlers                            |
| `server/services/`  | Execution, approvals, memory, retrieval and integrations |
| `server/storage/`   | Persistence and event records                            |
| `shared/`           | Shared types                                             |
| `tests/`            | Regression tests                                         |
| `docs/`             | Guides and implementation details                        |

## Troubleshooting

- **Connection test fails:** check the endpoint, credentials, proxy and model ID in Settings.
- **Command cannot start:** inspect the selected backend and preflight result. AppContainer needs its Python path; Docker needs a running engine and prepared image.
- **Skill is blocked:** check its required tools, packages, credentials and network access. Importing a skill does not prepare its environment.
- **An operation was interrupted:** inspect its outcome before retrying writes or commands. Restarting the app does not establish whether an external operation completed.
- **Windows launcher fails:** check `.data/logs/` and confirm Node.js 24+ and dependencies are installed.

When filing an issue, include the OS, Node version, selected backend, reproduction steps and sanitized error output. Do not attach API keys or private conversation data.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Planning, routing feedback and verification limits](docs/PLANNING-AND-ROUTING.md)
- [Interaction guide](docs/INTERACTION.md)
- [Memory](docs/MEMORY.md)
- [Automatic approval](docs/AUTO-REVIEW.md)
- [Security](docs/SECURITY.md)
- [Detailed feature reference](docs/FEATURES.md)
- [Testing and verification](docs/VERIFICATION.md)
