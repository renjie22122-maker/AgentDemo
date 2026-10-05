> Archived source / 历史原文：snapshot before documentation consolidation, 2026-10-05, commit `d663030`. Claims and counts describe their original revisions, not current behavior. Relative links point to the pinned source revision. / 结论和数量仅对应原记录版本；相对链接已指向固定历史提交。

# Automatic approval design

Policy version: 2026-10-02.1.

## Public sources

- https://learn.chatgpt.com/docs/agent-approvals-security
- https://developers.openai.com/api/docs/guides/agents/guardrails-approvals

Inspired by public separation of sandbox enforcement, independent review, risk and
authorization assessment, and failure-closed execution; not private Codex internals.

## Decision path

Existing tool guards decide whether approval is needed. Only auto mode invokes this
reviewer. Exact argument-free cd with execution metadata retains a narrow shortcut.
Local high-risk matches and forceHuman require a person. Other requests get an
independent, tool-free assessment with strict fields. The host permits bounded
low-risk actions with explicit/implicit authorization and medium-risk actions with
explicit authorization. Both require known effects, valid user-message references,
and no sensitive-data/security-change flags. High/critical/unknown risks go to users.

Changed user messages, conversation/settings or action invalidate the result.
Malformed responses, cancellation and timeouts never grant permission. Even a
provider ignoring cancellation cannot hold up approval indefinitely. Late results
cannot authorize execution. There is no automatic reusable grant cache.

Audit records include policy version, assessment, rationale, duration, fingerprint
and measured model usage. Existing human cards permit a one-time decision and
do not change the sandbox. No additional project files are read or sent.

## Limits

References establish provenance, not semantic truth. Models can misclassify actions
or quoted text. This is not a shell parser or a safety proof. Unknown script effects
require manual review; safe names are insufficient. High-risk handling is more
conservative than some public Codex policies. Tests verify policy/control flow with
fixtures, not a real-world false approval rate. The configured provider receives
the request and selected user messages; audit records may contain command arguments.
Never put secrets in commands. OS backend enforcement remains separate.

## Human clarification

When automatic review cannot allow, its optional clarification appears beside the
exact operation and rationale. The user can allow this operation once, deny, or
request an alternative with constraints. Alternative replies deny the original
operation and return feedback to the agent for replanning. They never rewrite and
execute a command behind the user's approval. High-risk automatic permissions were
not broadened. A decision about unknown/high-risk actions still needs a human.
