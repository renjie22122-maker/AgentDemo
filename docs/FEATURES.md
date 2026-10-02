# Detailed feature reference

[Project README](../README.md) · [中文说明](../README.zh-CN.md)

Implementation notes and historical validation records. Dated test counts describe their original runs, not the current test suite.

### Automatic team workload assignment

The lead can enroll existing workers with `configure_team_scheduler`. Ready tasks are selected by priority, with declared contract dependencies and overlapping file access checked before assignment. Eligible workers are ranked using declared skills, path ownership, lexical relevance, checked task history and current weighted load. Allocation records explain the score. Task weights and each worker's configured capacity are explicit; this is task scheduling, not CPU telemetry or a claim of optimal delegation.

Workers can call `await_team_task` to wait for up to 60 seconds without repeated model requests. The team panel displays scheduling status and each enrolled member's weighted load. Assignments are persisted in an audit record.

Permissions remain unchanged. Waiting-for-approval/user, recovery-only and uncertain-effect workers are excluded. Failed or blocked tasks are not automatically replayed. The scheduler does not spawn, resurrect or resize workers. Independent writable tasks require writable isolated copies; dependent writable work remains lead-managed because an existing copy may be stale.

Validation: one real-model run distributed two independent reads across two workers and completed in 61 seconds. This establishes the exercised path, not a statistical performance claim.

### Peer team modes (opt-in)

Conversation controls offer **Lead + workers** (default), **Host scheduling / peers**, and **Creative discussion / peers**. Delegation Off takes precedence.

Host mode stores the team independently of the coordinator lifecycle. Create all workers before `configure_team`, then enable `configure_team_scheduler`. Tool and lifecycle events trigger host assignment without another coordinator model request. A member failure no longer automatically cancels the team; the UI distinguishes stopping one member from stopping the whole team. Interrupted tasks retain ownership: uncertain operations are never reassigned or replayed. Transfer coordinator, planner, reviewer and summarizer roles through the team panel or `handoff_team_role`. Roles grant coordination authority, never file or command permissions.

Creative mode supports attributed broadcasts and directed contributions (`team_discuss`), recipient-scoped transcripts and `await_team_message` (up to 60 seconds without model polling). Configure an explicit per-member message limit (default 12, range 1-100). Members exchange clues or opinions, then `end_team_participation`. Agreement, votes and fiction are not verified facts. This is a hosted discussion experiment, not cryptographic consensus or a distributed zero-trust protocol. The host user can inspect records; recipient filtering is not encryption.

The team panel separates individual completion from host-computed team status. Declared artifacts require version-bound evidence; isolated copies need integration; unresolved effects and failed members block completion. Existing version/conflict checks and merge approvals remain enforced. A read-only coordinator cannot gain merge permission through a role transfer.

Limits: model-driven spawning stops after the initial roster is configured. Optional host automation may add bounded read-only workers or replace safely recoverable members. Execution ancestry and depth limits remain for provenance and permissions. Cross-session federation and arbitrary command replay are not supported.

Historical peer-mode validation: 81 regression checks passed. After fixing a missing-artifact-verification exit path exposed by a real-model trial, the host scenario completed in 53.3 seconds (creator ends early, two workers finish) and the creative role exchange in 36.1 seconds. These two samples validate exercised paths, not general multi-agent superiority.

### Recovery, bounded scaling and coordinator takeover

Open **Team** beside the composer, choose **Runtime management**, then expand **Recovery and automation** to enable its persisted policy. All automation is opt-in. The panel configures active worker capacity, a lifetime new-worker allowance, automatic recovery attempts per member, idle retirement time, and an optional measured-cost threshold. The threshold prevents additional starts/recoveries; it does not cancel in-flight requests or guarantee a final invoice ceiling. Unknown billed usage blocks new starts when a threshold is set. Global model concurrency and child/depth limits still apply.

Recovery checks the operation journal and unfinished tool calls. It starts a fresh model turn referencing durable outcomes instead of resubmitting old tool calls. Only the same durable operation identity reuses a completed receipt. A new model call with identical arguments is a new operation and retains normal permission checks. Unknown commands/writes and incomplete coordination operations block recovery. Exact file-content inspection can reconcile matching writes. A later conversation prevents revival of its obsolete run. Automatic recovery is limited to read-only members and configured attempts; explicit recovery can continue other members only after unresolved outcomes are checked. Manual stops suppress automatic revival.

Scaling is limited to ready read-only work and existing authority. The host records a ticket before spawning, reconciles that ticket after interruption, and never blindly duplicates the new member. Idle retirement applies only to host-created workers with no unfinished owned tasks, unknown effects, coordinator role or ready demand. Busy or user-created members are not terminated by scaling.

Coordinator takeover is deterministic within this single host: after the previous holder terminates or ends participation, the host chooses an eligible active member, increments the team term/revision, and records/notifies the transfer. Current-role checks fence stale role authority. Slow responses alone never trigger an election. This is not a multi-server consensus protocol, and taking a role does not grant file, command or merge rights.

Crash-window regression tests exercise reservation reconciliation and duplicate mutation suppression. Real API fixtures exercise a saved interrupted read-only member and a host-created replacement worker; these tests do not establish exactly-once semantics for arbitrary external side effects.

Current automation validation: 89 regression checks and the policy-panel browser test passed. Real API fixtures passed for recovery (29.4 seconds) and bounded expansion with coordinator takeover (23.5 seconds); the fixtures model an interrupted member rather than claiming a full operating-system crash test.

### Model discovery and team crash reconciliation

Settings fetches the configured provider's model catalog automatically when saved credentials are available. Selecting a discovered model matches its declared context window, output ceiling, vision support and supported reasoning levels. Missing metadata retains manual fields; changing model clears unverified price estimates. **Add discovered models to chat selector** creates missing connections using the same provider credentials without duplicating existing models. Official DeepSeek currently lists Flash and V4 Pro; legacy V4 Flash / Vision Exp IDs are compatibility aliases, not additional independent current models.

Local team mutations use durable call receipts committed in the same SQLite transaction as task/role/discussion state. Restart reconciliation restores missing completion records without invoking the tool again. Spawn reconciliation identifies created children by an exact run/call ticket. Recovery rebinds unfinished ownership to the replacement member. Legacy task updates are reconciled only when the exact revision and requested task state match; ambiguous legacy operations and unknown external effects remain blocked for inspection. Pending operations from the current live process are never treated as rolled back merely because a run has been marked interrupted.

### Image tools and message attachments

Vision-capable connections can use `read_image` to inspect workspace files (including extensionless images) or public image URLs. PNG, JPEG, WebP and GIF are decoded from actual bytes, normalized to at most 640,000 pixels / 1 MiB, and delivered as image content to the model. Animated images use the first frame. SVG and PDF require conversion. File scope checks and public-network DNS/address pinning remain enforced; declaring vision support alone does not prove a remote model accepts images.

Uploaded files remain drafts until a user message accepts them. Drafts show image thumbnails and a remove control. Sent attachments are durably linked to that message, rendered in chat after reload, and no longer listed as pending or reattached to each follow-up. Image-only messages are supported. Deleting a draft cannot delete already-sent message attachments.

Historical image-tool validation: 103 regression tests passed, including real subprocess crash windows, image normalization, private-address rejection and single-message attachment binding. Browser checks exercised model discovery and upload/remove/send/reload. Two real DeepSeek Flash trials identified different random raster codes and colors: one via upload and one exclusively through `read_image`. These small positive samples establish the tested pixel paths, not general visual accuracy.

### Runtime reliability audit update

User follow-ups use a durable inbox, with pending/delivered status. Interrupted isolated-copy merges record per-file progress and require a fresh version review before continuing. Merged copies cannot accept further writable work. Recovery rebinds descendant and merge ownership. A per-data-directory process lock rejects a second server. Checkpoints are stored separately from frequently updated run metadata.

Model discovery and settings changes never reuse an old API key for a different origin. Private settings receive restricted filesystem permissions; Windows saves encrypt keys using DPAPI (same-user processes can still decrypt); non-Windows storage remains permission-protected local files. Provider retries are limited to rejected 429/selected 5xx responses, never partial streams or ambiguous transport failures. See [verification](VERIFICATION.md).

## Media and automatic approval

Configure independent media connections in Settings. The main conversational model can call `media_services`, `generate_media`, `media_status`, and `cancel_media`. Adapters cover OpenAI-compatible media, fal, Replicate, Gemini, ElevenLabs, Deepgram, AssemblyAI, Meshy, Tripo and MiniMax official endpoints. Provider support is protocol-level: available models, reference inputs, cancellation and account entitlements vary. Do not treat this list as a claim that every model has been tested live.

MiniMax direct connections use `https://api.minimax.io` and a pay-as-you-go API key. Video supports H3 and legacy Hailuo task receipts; speech synthesis requires `voice_setting.voice_id`. Music access depends on the account. Dictation uploads a completed recording and inserts editable text into the draft; it is not a realtime voice conversation. Media cards stay at their first event in the conversation, update in place, and can be collapsed.

Media prices are manually configured estimates, not provider invoices or hard budgets. Submission results that are unknown are not automatically resubmitted. Cancellation is provider-dependent. Real paid-generation integration testing remains outstanding; automated tests use protocol fixtures.

The composer Access control combines independent approval and execution-isolation choices. Read-only prevents file writes and command execution. Conversation overrides do not change global defaults; child conversations inherit them. Automatic approval uses a separate tool-free model request and asks the user on uncertainty or review failure. It does not remove sandbox restrictions, is not a guarantee of risk detection, and incurs separate model usage. Configure its reviewer under execution/security settings, not media settings.

### Routing evaluation and inspection

Task contracts distinguish existing sourced inputs from outputs that another task must produce. Read-only conversations cannot create runnable write plans. Scheduler history is team-local, evidence-filtered and heuristic; it does not train a model. See [the live planning comparison and its limits](PLANNING-EVALUATION-20261001.md).

Context details cache snapshots by run revision and coalesce pagination requests. Display settings offer automatic scaling or 25–150%; Settings also allows changing the assistant display name.

### Conversation concurrency

The parallel model setting applies independently to each root conversation, including its recursive sub-agents. Task admission, model requests, context summaries and auxiliary model calls share that conversation's capacity. A busy team does not consume another conversation's slots. Total process concurrency can therefore grow with the number of active conversations; provider account rate limits still apply.

### Skill discovery and resources

Conversation selections prioritize skills; the agent can search other enabled library skills with `find_skills`. Disable a library skill to exclude it. Skills remain untrusted reference material and cannot grant execution, upload or billing permissions. Supporting files can be listed, read or copied exactly (including binary assets) into the task filesystem using `materialize_skill_file`; differing destination files are never overwritten. Copies do not install dependencies or prove end-to-end capability. Existing configured media/web services may supply compatible operations without exposing host credentials to commands.

Commands report a running heartbeat and recent host/Docker output while awaiting completion. Timeout or cancellation requests termination; if output handles never close, the executor returns an unknown outcome after a two-second cleanup grace period. This prevents an endless wait but does not prove descendant cleanup or undo side effects. Inspect unknown operations before retrying. The native adapter has its own startup/preflight allowance and a bounded cancellation fallback.

### Processing while waiting

Use `run_command` with `background: true` for an independent long-running operation. It retains the same approval, sandbox and execution timeout, returns a durable job ID and lets the agent work on unrelated steps. `background_commands` inspects status/logs; `wait_background_command` waits on events without model polling and wakes for a new message in the same conversation; `cancel_background_command` stops owned work. Completion is injected as host feedback, not as a fabricated user message. A final answer cannot complete the run while its background jobs are still running.

An optional `readyText` marks an observed stdout phrase, not service health; follow it with a targeted approved health check. Stop task-owned servers after use. Command completion, timeout, cancellation and unknown outcomes are recorded separately. After a service crash, formerly running jobs become unknown and are never automatically replayed or killed by a stale PID. Conflicting work in the same environment must be serialized by the agent; automatic filesystem conflict prediction is not provided.

Background commands also support deferred approval. Their job and approval IDs are returned while the decision is pending, permitting unrelated authorized work. The exact captured command starts only after approval and execution-configuration revalidation; rejection/cancellation starts nothing. Command timeouts start after approval. Pending approvals are included in the run's completion barrier, and service recovery cancels pre-execution jobs rather than treating them as executed. Ordinary foreground commands, questions and non-command approvals retain their synchronous workflow.

### Approval guidance and skill selection

Approval cards show a heuristic risk label with text as well as color: low, review scope, high, or uncertain. This is not a safety guarantee. Automatic review retains initial and recent user intent, uses separate per-conversation request queues, and can approve the exact argument-free `cd` built-in query without an auxiliary model request. Composed commands never use this shortcut; high-risk matches and review failures require human review. Project source files are not added to reviewer requests.

Skill selection has no fixed 30-item cap and deduplicates IDs. Import no longer silently stops at 200 skills (directory traversal remains bounded to eight levels and excludes links/dependency folders). Search, overlapping purpose categories, source groups and selection-state filters support bulk select/clear. Classification is inferred metadata, not a capability test. Only the first 20 selected descriptions are placed in the initial model context; the complete enabled catalog remains available through paginated `find_skills`.

### AI skill classification

Skills Library offers an explicit metadata-only model classification request, a preview and a separate Apply action. Sources remain import-derived. New category labels appear in skill filters after applying. Changed catalogs invalidate old previews; existing categories stay unchanged on errors. Imported skills still use local fallback categories until classified. Auto-review now includes recent same-conversation manual decisions as scoped evidence, never as reusable grants.

### Memory scope

See [background memory](MEMORY.md) for current extraction, confirmation and scope behavior.
