# Conversations, progress and recovery

[English](INTERACTION.md) | [简体中文](INTERACTION.zh-CN.md) · [Documentation](README.md)

Reviewed: 2026-10-05; code baseline: `d663030`.

## Navigation

Newly opened conversations start near the latest content. Steps can expand/collapse, with a compact live preview when folded. Round navigation locates user turns. The context/workspace strip opens detail panels; context pages and knowledge-maintenance progress load independently of slower statistics.

Thinking, collaboration and access controls sit near the composer. Display scaling offers Auto and 25/50/75/100/115/125/150%. Ordinary chats show chat files; project chats show registered roots. Custom names are preserved through the Amadeus rename.

## Live updates

Elapsed wall time includes model, tools and approval waits; terminal runs stop the timer. Durable follow-ups display pending until the next safe consumption point, not immediate model receipt. Background jobs permit independent work; a foreground command can still occupy the run.

The client reconnects up to five times with 1/2/4/8/16-second backoff; a healthy heartbeat resets the streak. Reconnection reauthenticates and restores durable state without resending operations. Event IDs suppress duplicates; large gaps refresh snapshots. Manual reconnect remains available. A mutation timeout is not evidence that it failed.

Questions and approvals appear at their chronological event positions. A global attention menu jumps to the relevant chat/card. Desktop notifications need browser permission and an open page; this is not a persistent Windows notification service. Generic notification text avoids exposing task content.

## Review and recovery

Run changes are grouped and collapsed, with red/green text differences, line counts and unified/before-after views. Snapshots exclude hidden/generated/linked/binary/oversized files and are bounded (400 entries, 2 MB, eight levels). They can observe user edits too; they are not undo or transaction isolation. Old events cannot recover absent before-images.

Unknown effects allow a read-only inspection continuation, not blind write/command replay. Exact full-content writes and recorded edit postimages can be reconciled automatically. resolve_effect may then ask for confirmation. “Allow another attempt” records explicit retry authorization while retaining the unknown prior outcome; it does not itself execute a command. Subsequent work retains normal approvals.

Approval waits have no expiry and do not consume command execution time. Stop/restart cancels waiters and exposes recovery; it never silently approves. Known pre-start errors are distinguished from unknown execution.

## Content and workspace preview

Markdown supports tables, math, code, attributed quotations and embedded media. HTML and Mermaid default to preview with a same-sized scrollable code view. See [formatting](CHAT-FORMATTING.md).

Workspace HTML preview can inline up to 40 scoped local resources, with a browser sandbox/CSP and no host-page access. It is not arbitrary Python execution, a dependency installer or a full development server. See [tool boundaries](TOOL-ECOSYSTEM.md).
