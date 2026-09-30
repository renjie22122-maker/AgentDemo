# Live conversations

Rich Markdown supports GFM tables, task lists, strikethrough, footnotes, highlighted
code and copied code. KaTeX renders inline/display formulas and matrices locally;
common LaTeX parentheses/bracket delimiters are normalized outside code samples.
Raw HTML remains disabled, KaTeX trust is false, macro expansion is bounded and
invalid formulas retain a readable fallback.

Every run shows elapsed wall time, including tools, model calls and user waits.
Terminal runs freeze at their persisted last transition.

The UI watches heartbeats and retries a broken or silent stream up to five times,
with 1/2/4/8/16-second backoff. A healthy heartbeat resets the failure streak.
Manual reconnect is available after exhaustion. Reconnection reauthenticates and
reloads durable events, pending inputs, usage and partial streams. It does not
resend messages, model calls or commands. Read requests time out after 20 seconds;
mutations after 120 seconds. A timed-out mutation may have succeeded: inspect its
state instead of blindly retrying it.

The global attention menu lists pending questions and approvals across chats.
Selecting one switches to its chat, closes the menu and focuses the input card.
Desktop notifications require an explicit click and browser permission. Unsupported
browsers still show the menu. These notifications require an open page; they are
not a persistent Windows background service. Notification content is generic.

File tools and commands emit durable before/after observations within project
folders (including personal-chat file storage). Text diffs are expandable.
Snapshots exclude hidden, generated, linked, binary and oversized files and are
bounded to 400 entries, 2 MB and eight directory levels. Partial coverage is
reported. Diff computation also has a time/edit bound. Concurrent user edits can
be observed too: this is a review aid, not transaction isolation or undo.
Old events without snapshots cannot reconstruct before-images.

Validation:

- `pnpm test`: lifecycle, provider, permissions, runtime and UI transport tests.
- `node --import tsx scripts/browser-reliability.ts`: Edge integration with
  deterministic model responses; real disconnect and offline catch-up, cross-chat
  input navigation, formulas, diffs, timers, mobile overflow and code copying.
- Windows Action Center display itself depends on browser/OS settings and is not
  claimed as verified by headless browser tests.

## Composer controls and inspection (2026-09-30)

Thinking and Team are compact pill buttons. Thinking opens a discrete supported-level slider with descriptions; Team explains Single agent, Automatic and Prefer collaboration, plus current depth/tree/concurrency limits. Arrow keys operate the controls and Escape closes their popovers. Settings remain locked during a run.

A persistent conversation status strip shows run status, context usage and workspace/chat artifacts. Clicking Context or Workspace opens the relevant right-side tab. Ordinary chats are labelled Chat files rather than project workspaces.

Context displays the shared token estimate calibrated against successful main-request API usage. It is never cumulative billed input. Details include checkpoints, capacity, message pagination and compaction records. The occupancy meter and red threshold now use the same token budget. Live panels refresh at five-second intervals.

File browsing reuses the runtime's authorized roots and rejects traversal/links/private state. Text previews are bounded at 200 KB. Local HTML preview inlines up to 40 scoped local script/style/image resources into an iframe without same-origin, forms, popups or top-navigation permissions. CSP blocks ordinary external resource loads and connections; this is a browser preview boundary, not OS/network isolation. External dependencies, module imports and development-server features are unsupported. Preview can expand and collapse; source stays available.

The Edge integration fixture verifies slider/policy persistence, header-to-panel navigation, context expansion, local HTML+JS+CSS interaction, parent-DOM denial and blocked fetch to the control API, plus mobile layout. HTTP tests verify session/run scope, file traversal denial and cookie authentication.


## Execution boundaries and context meters
Settings provides four execution modes: host approval (no OS file isolation), Windows AppContainer with host networking, AppContainer strict offline, and offline Docker. These are execution mechanisms, separate from conversation approval policy. Saving affects subsequent commands, not existing processes. Native and Docker failures do not fall back to host execution. Existing configuration is preserved.
The context panel distinguishes measured input from calibrated or local estimates. Its red marker is the actual token threshold used by the runtime, with output and safety reservations.
Command collection tests verify compound-command tails and the explicit truncation flag for output exceeding the collection cap. This does not establish the cause of previously reported missing output.


## Public web tools
The built-in web channel is independent of command networking and can be disabled in Settings > Web access. Both parent and child runs use the same tools and permission checks.
- web_search uses DeepSeek's Messages native search protocol, reusing a selected model connection only for the same HTTPS origin. The default endpoint is https://api.deepseek.com/anthropic/v1. It requires structured search result blocks; prose alone is not search evidence. Search responses are bounded and cancellable, with a 60-second default deadline and no automatic paid retry. Auxiliary search shares model concurrency and contributes API usage to the requesting run. Missing usage is marked unknown; prices for an overridden model remain unknown.
- fetch_url pins validated public DNS addresses, rechecks redirects, applies a whole-operation deadline, returns readable content and links, and explicitly marks truncated results. Binary documents use document import. It does not run page JavaScript.
- run_command retains the chosen command backend and network policy. A TLS failure in one executable does not establish DNS/network failure or authorize bypassing strict offline mode.
Protocol reference: https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/web/web-search-deepseek


## Token-based compaction
Context inspection and execution now share one token-budget calculation. A normal model request saves its measured input count with the model identity and a hash/estimate of that request. Unchanged inputs use measured tokens; appended messages use the measured baseline plus conservative estimates for new content. Changed history/tool schemas use calibrated estimates. Model changes invalidate calibration. Search and summarization usage do not overwrite this baseline.
The trigger is the smaller of configured capacity times compaction ratio and capacity minus output tokens and safety margin. Tool definitions and estimated image cost are included. Images and non-tokenized text are estimates, not exact counts.
Compaction retains the latest user request and complete recent tool-call/result groups. Older history is summarized in bounded segments. Empty/non-shrinking/insufficient summaries never replace the original history. Oversized irreducible input yields an actionable error rather than silent truncation.
Live regression uses an isolated 32,768-token test capacity and 30% trigger to force three compactions; these are test settings, not changes to production model capacity.


## Recovery without locking chat
Uncertain side effects no longer prevent starting a conversation turn. The next turn uses read-only inspection tools (and existing web access), without write/command/delegation access. Known logged pre-execution failures are reconciled automatically. The automatic-check action can also verify an interrupted write_file against its exact requested full content, without replaying it.
Unresolved commands are never assumed safe to replay. Users can select Allow another attempt instead of writing a manual inspection note. This records retry_authorized while explicitly retaining that the previous outcome is unknown; it does not execute the operation. Subsequent attempts still use normal permissions and approvals.
Commands enter the side-effect journal after approval and immediately before execution, so cancelling an unanswered approval does not create an uncertain operation.
File changes are grouped by run in a default-collapsed section. Individual observed changes remain separately expandable, with red deletions, green additions, line numbers, counts, and unified/before-after views. Snapshot limits still apply.
