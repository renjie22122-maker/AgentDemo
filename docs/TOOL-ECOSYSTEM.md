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
visible screen pixels or application-rendered window pixels, move/click/double-click, type, basic keys, scroll and
drag. Input uses SendInput; a named mutex serializes desktop actions across clients.
Typing/clicking/dragging requires the selected window to already be foreground.
Loss of focus stops input; it does not silently activate another window. Drag releases
the button in cleanup. Screenshot metadata describes physical screen coordinates.

This is **host desktop control**, not a VM. With no windowId, screenshots capture
visible-screen pixels. With windowId, screenshots use PrintWindow with
PW_RENDERFULLCONTENT and can capture a covered window without activating it.
There is no automatic screen-capture fallback. Hidden, minimized, invalid, unchanged
sentinel and oversized windows fail explicitly. Capture stays under the existing
20-second subprocess deadline. Dimensions are limited to 16 million pixels.
PrintWindow success does not certify content: GPU/protected applications may return
black, stale or incomplete frames. Metadata reports capture=window-print,
contentVerified=false and these limitations. This is not Windows.Graphics.Capture. Elevated applications, secure
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

## Coding harness extensions (2026-10-04)

- `inspect_file_version` provides a UTF-8 content hash; `apply_patch` accepts
  version-pinned exact-context hunks for up to 20 existing files. It preflights all
  targets, rechecks before each write and reports completed/uncertain paths after
  partial failure. It is not a multi-file transaction, adversarial lock, deletion
  tool, or syntax verifier. Use language-specific checks afterward. Existing
  `edit_file` remains available for small edits.
- Patch write approval shows the declared file/hunk set in one request. This does
  not approve future commands or changed patches.
- `inspect_git_state` parses porcelain branch/file/conflict state and records the
  first observation per run. `inspect_git_diff` inspects staged/unstaged tracked
  differences. Both use the ordinary audited command backend and approvals.
  No privileged Git subprocess bypass, automatic restore, or inferred authorship.
  A first observation is not necessarily the repository state before the task.
- `transform_data` offers count, field projection, equality filtering, unique and
  numeric sum, usable with workflow references. Bounds: 1000 items / 1 MB.
  No JS evaluation, arbitrary expression language or unbounded parallelism.
- Settings has additive action restrictions: tool, optional project, relative
  path glob, exact command and backend. Deny wins; ask requires a human even in
  automatic-review mode. No allow rule can bypass existing isolation because no
  allow grants are implemented. File path rules do not inspect arbitrary shell
  internals. Use the OS backend to enforce command filesystem boundaries.
- Source warning IDs are retained in a bounded compaction ledger (64 recent references,
  with an explicit omitted count); this is not full semantic taint propagation.
- Tool output receives a host source hash and untrusted provenance event. A small
  heuristic probe warns about instruction override, role/authorization spoofing,
  and secret-export language. Raw JSON remains intact for workflows. Matches are
  warnings, not proof of attack; no matches never mean trusted. This is not a
  comprehensive injection classifier or semantic taint tracking system.
- `request_plan_review` records explicit human agreement to an exact board hash
  and revision, rejecting changes during review. It does not grant tool rights
  or automatically gate every existing execution path.
- Specialist definitions in Settings provide role instructions, enabled skill
  IDs and restrictive tool lists. `spawn_agent(specialistId)` intersects parent
  tools and retains the parent model and normal permission/isolated-copy rules.
  No automatic external provider switch. Existing persistent members and
  `continue_agent` are reused rather than adding a duplicate background-agent API.
- `inspect_model_capabilities` separates configuration, adapter support, unknown
  and not-integrated states. No endpoint capability is labelled verified without
  an actual test. This reports capabilities; it is not native deferred-tool-search
  integration or an endpoint probing service.

Still open: robust multi-file crash recovery for patches, Git-aware restore with
user-change ownership, unified scoped allow grants, broad injection attack and
false-positive benchmarks, native provider deferred protocols, automatic capability
probes, fully isolated desktop provisioning, broader GPU-window capture compatibility, and online
publisher/registry/OAuth lifecycle. These are not implied by passing unit tests.

Validation of this extension: 312 regression tests passed; a synthetic DeepSeek run used five model calls to discover aggregation, compute 42, apply a hash-pinned patch, and verify persisted bytes. An isolated browser test saved action rules and specialist settings with no page errors. These results do not establish optimal delegation or attack resistance.

Window-capture regression: opt in with AGENTDEMO_DESKTOP_TEST=1 and run
node --import tsx --test tests/window-capture.test.ts on Windows. The fixture creates
a red target behind a blue occluder, independently confirms the screen pixel is blue,
asserts the target capture is red, then checks minimized/invalid window rejection.
It closes only its own process. Default CI skips this interactive test explicitly;
a skip is not a pass. This local integration test passed on 2026-10-04.


Automatic review evidence (2026-10-04): the same conversation model may inspect up
to six scoped literal/package/test candidates, reading at most 128 KB per file and
sending at most 12000 characters per file, with full-content hashes and truncation
flags. Package pre/main/post scripts are considered; imports and test discovery are
not exhaustive. Recent same-run command observations supplement these sources.
Separate reviewer connections do not automatically receive source or command logs.
Approval cards show source metadata. Failed reviews distinguish preparation,
provider, invalid-response, deadline and cancellation failures without exposing raw
provider error bodies. Exact host process-name/test-substring cleanup patterns
require human scope review; cwd does not limit which processes may be terminated.
Host command review reports host networking, not the native backend's deny setting.
No automatic approval is proof of safety, and no failed review defaults to allow.

Approval presentation now distinguishes review availability failures from action
risk, missing authorization, process ownership and incomplete source evidence.
Validated assessment reasons replace the initial generic unknown label; deterministic
high-risk signals remain visible. Presentation does not authorize execution.


Review prefix optimization: stable environment and authorization fields precede
changing sources and exact actions; object key order is canonical while array order
is preserved. Provider cache hits remain measured, not guaranteed. Concurrent identical
review computations join only within the same run, configuration/authorization stamp,
exact serialized evidence and cancellation signal. Completed results are evicted,
each caller retains source/context checks, and usage is charged to the owning review
once. This is inference deduplication, not a reusable execution grant. Review cards
separately show measured input/cached/output tokens, estimated cost and elapsed time.
No local KV cache or completed authorization cache is implemented.


Validation (2026-10-04): 324 tests passed, one opt-in desktop test skipped; typecheck
and frontend build passed. Two sequential synthetic DeepSeek arithmetic-script
reviews each used 1,118 input tokens, with 512 then 896 cached tokens (45.8% and
80.1%). Durations were 1.896s and 3.322s. This small warm-cache observation is not
a before/after benchmark or a latency improvement claim; reviewed commands were
not executed. No private project source was used in this probe.


## Generated media continuity

Generated bytes remain in private conversation media storage. Receipts (including
old completed jobs) now expose scoped media:jobId:outputId handles and local UI
URLs, not unrestricted filesystem access. read_image(mediaRef) attaches normalized
pixels for QA. generate_media references accept attachment IDs or completed media
handles in the same conversation; the host validates integrity and sends inline
image/audio/video bytes to the approved provider field. Inline references are
limited to 25 MB, and actual provider format/field support still applies.
export_media copies exact bytes to an authorized workspace path with write-policy
checks and atomic no-clobber publication. Existing files and protected paths are
not overwritten. inspect_media also works on historical outputs without exporting.
No arbitrary host paths or cross-conversation media are admitted.

New MP4 outputs report audio-track presence/absence when structurally readable;
other containers, malformed files and legacy uninspected outputs remain unknown.
A declared audio track does not prove audible samples or browser codec support.
The UI does not mute videos by default or synthesize absent audio. Media HTTP
responses support single byte ranges for playback/seeking while preserving all
original bytes. No transcoding, audio stripping or paid generation is triggered
by inspection/export. Source video must actually contain audio; this cannot repair
a provider's silent output or an assembly script that discarded audio.


## Browser interaction continuity

interaction_capabilities reports adapter configuration and policy availability
without launching host processes or exposing credentials. Enabled-unverified is
not a successful runtime probe. Browser adapters retain same-context popup tabs;
browser_tabs, browser_select_tab and browser_close_tab use stable session-local
IDs. Browser results include current tab metadata; a popup never silently replaces
the selected tab. Closing one tab does not close the user's personal browser.
Existing network/context policies apply to all tabs.

Runtime guidance now directs agents to discover existing adapters before writing
automation scripts, check new tabs after submissions, recheck desktop targets after
approval, and avoid forced-focus workarounds or claiming an entire session was
background-only after foreground actions. These instructions improve behavior;
they are not a proof that every model follows them. The native desktop adapter's
existing foreground-window checks still reject mismatched input. PrintWindow
remains application-dependent and does not solve GPU capture universally.

A real headless Edge integration test on a local fixture exercised Chinese input,
new-tab form submission, tab selection, result verification, screenshot and scoped
cleanup. Run with AGENTDEMO_BROWSER_TEST=1 and node --import tsx --test
tests/browser-tabs.test.ts. Default CI explicitly skips this installed-browser test.
