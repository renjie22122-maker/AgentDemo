# Tool ecosystem

AgentDemo uses one audited tool runtime for direct calls, composed calls and trusted
hook commands. Capability discovery does not grant permissions. External text,
screenshots, skill instructions and retrieved memories remain untrusted context.

## Discovery and composition

- `search_tools` progressively exposes matching schemas for the active run. It
  supports English keywords and Chinese aliases. Set `semantic: true` to use
  configured **local** multilingual embeddings with reciprocal-rank fusion and
  an in-memory catalog cache. Missing/failed local embeddings explicitly fall
  back to lexical retrieval; this path never sends catalog text to a remote service.
- `search_capabilities` combines tool, skill, memory and knowledge discovery while
  preserving each source's scope and individual audited calls. It is not a new
  global knowledge scope. MCP catalogs remain separately approved and paginated.
- `glob` and literal UTF-8 `grep` preserve FileScope, skip linked/hidden/build
  entries, and report limits. Bash uses the existing Unix/Docker execution backend;
  there is no implicit Windows host/WSL fallback.
- `batch_read_tools` supports up to 20 independent parallel-safe reads (four workers).
- `tool_workflow` supports 12 declared steps, boolean conditions, result references
  and loops of up to 20 items, with at most 40 calls. It never evaluates arbitrary
  source code. Each member retains normal permissions, approval, effects and audit.

Example:

```json
{
  "steps": [
    { "name": "read_json", "arguments": { "path": "paths.json" } },
    {
      "name": "read_file",
      "forEach": { "$ref": "0.data.paths" },
      "arguments": { "path": { "$ref": "item" } }
    }
  ]
}
```

Use `read_json` for structured files; `read_file` includes human-readable line numbers.
A step's `data` is its parsed JSON result, or its text when not JSON. Conditions use
`when: true/false` or a reference resolving to a boolean. Future references,
prototype access and composition recursion are rejected. Partial execution is
reported as partial failure; it is not a transaction and is never blindly replayed.

## Browser

Settings → Tool ecosystem → Add browser adapter creates a disabled MCP entry.
Enable it only after reviewing its host process authority.

The bundled Playwright adapter provides navigation, rendered text/controls, clicking,
filling, keypress, scrolling, selection, bounded element waiting, screenshots,
upload/download, close and reset. Windows uses installed Edge; other platforms need
installed Playwright Chromium. Browser installation is not performed automatically.

- Profiles are conversation-scoped. Optional persistence saves cookies and local
  storage on this computer, not tab state or an entire browser profile.
- `browser_reset` clears saved state. Permanent conversation deletion removes owned
  browser state and closes clients.
- Uploads go through the host's scoped-path bridge, are limited to 10 MiB, and require
  explicit approval. Inline bytes from the model are rejected by that bridge.
- Downloads are limited to 10 MiB, use a new path in an existing authorized folder,
  refuse overwrites and register an artifact. Downloads are not opened or executed.
- Allowed hosts are exact hostnames. With a nonempty list, HTTP redirects and
  WebSockets are blocked rather than silently following an unchecked destination.
  This can break login flows; navigate to a reviewed final URL explicitly.
- Empty allowed hosts uses the approved host browser network. These are application
  rules, **not** DNS-pinned SSRF protection or OS network isolation. The public HTTP
  fetcher's stricter networking remains separate.

Source snapshots include retrieval time, truncation and a rendered-text hash. A hash
identifies content, not truth. Persistent cookies may contain login state; do not
share the private data directory.

## Windows Computer Use

The adapter now builds an AgentDemo-owned C# executable using the installed Windows
.NET Framework compiler. It does not run an unsigned PowerShell script or change
PowerShell execution policy. Environments blocking native executables still need
an administrator-approved installation or a separately configured backend.

Capabilities: enumerate windows, inspect up to 100 UI Automation controls, capture
visible screen/window pixels, move/click/double-click, type, basic keys, scroll and
drag. Input uses SendInput; a named mutex serializes desktop actions across clients.
Typing/clicking/dragging requires the selected window to already be foreground.
Loss of focus stops input; it does not silently activate another window. Drag releases
the button in cleanup. Screenshot metadata describes physical screen coordinates.

This is **host desktop control**, not a VM. Screenshots use visible-screen capture,
not Windows.Graphics.Capture of occluded windows. Elevated applications, secure
desktops, every international keyboard and arbitrary GUI applications are not
certified. Use a trusted external MCP desktop running in a separately provisioned
VM when OS isolation is required. AgentDemo does not provision or certify that VM.

## Skills and managed packages

Skills preserve progressive loading, resource copying and guarded dependency setup.
Declared dependencies/tools/verification are compatibility hints, not permissions.

Skills → Skill packages supports local-package preview, hash-pinned installation,
updates, version selection/rollback and removal from active use. New revisions start
disabled. Existing package versions are retained; removal does not delete source files.
No installation scripts run. Prepare dependencies in a task using the existing
approved skill-environment tool, then verify the actual environment.

Packages may include `agentdemo-signature.json` with a base64 `signature`.
The publisher signs the raw 32-byte digest using Ed25519. The digest is SHA-256 of
JSON encoding of the path-sorted inventory `[{path,bytes,sha256},...]`; paths use
forward slashes. Hidden/build directories and the signature file are excluded.
Users supply a trusted publisher PEM public key. Signature validity does not certify
code safety; unsigned packages are explicitly labeled. Signatures are not self-trusted.

The upstream links are a source catalog, **not** a hosted marketplace, publisher
identity service, automatic remote downloader or vulnerability-scanning service.

## Hooks

Configured stages: before/after Tool, Command, Compaction, TaskComplete and MemoryWrite.
Project filters and exact tool names or `*` are supported. Use target `context`,
`task` or `memory` for their non-tool stages.

Actions: deny (before stages), audit notification, and commands for tool/command
stages. Command hooks use run_command with normal permission, approval and effect
tracking. A hook cannot invoke itself recursively; at most eight hook commands run
per outer invocation. Hook failure stops the associated flow instead of claiming
success. Script hooks for compaction/memory/finalization are intentionally unsupported
to avoid executing shell commands inside persistence or completion transactions.

Skills cannot activate host hooks or grant execution rights.

## Research and artifacts

`research_sources` collects up to six public URLs with individual failures, progress
and evidence IDs. `crosscheck_sources` verifies exact quoted spans, records model-
assigned supporting/contradicting stances, identifies duplicate content and counts
distinct hosts. It does not prove semantic truth or publisher independence and never
automatically promotes web claims into memory.

Artifact registration records path, hash, size, MIME hint, producer and task.
Inspection rehashes to report current/stale/missing/inaccessible; retirement keeps
the disk file and audit. Registration and unchanged bytes are not correctness proof.
Concurrent-change checks are not adversarial filesystem locks.

Every tool has started/completed audit and bounded elapsed-time progress while
waiting or running. Commands additionally stream output. Progress does not invent
a completion percentage or make a blocked model execute simultaneously.

## Validation

Regression tests cover permissions, composition, partial failures, references,
loops, source scopes, artifact freshness, package signatures/tampering/rollback,
memory hooks and command-hook recursion/readonly behavior.

Live browser fixtures test navigation, fill/click, screenshot, upload/download,
select/wait, persistent cookies, redirect rejection and state reset.
A separate empty-data UI test checks settings, disabled defaults and package install.

Native Windows testing verified 2560×1440 screenshot pixels and reversible pointer
movement. A dedicated disposable GUI fixture verified window discovery, UI Automation,
clicking, text input, a keypress, dragging and target screenshots. No user applications
were typed into. These are targeted integration checks, not broad capability benchmarks.

Real DeepSeek validation exercised discovery, structured JSON reads, conditions,
looped text reads and a checked sum (17 + 25 = 42). The successful run used three
model calls. Earlier attempts exposed numbered-text/JSON incompatibility (fixed by
read_json) and a model choosing a JSON reader for plain text. The final test specified
the readers explicitly; it does not demonstrate reliable autonomous tool selection.
Semantic ranking and broad application-level desktop benchmarks remain separate work.
