# Automatic approval

[English](AUTO-REVIEW.md) | [简体中文](AUTO-REVIEW.zh-CN.md) · [Documentation](README.md)

Reviewed: 2026-10-05; code baseline: `d663030`.

Policy version in code: `2026-10-04.1`. This is Amadeus's implementation, not a claim to reproduce private Codex internals.

## Decision path

Tool guards first determine whether approval is required. Auto mode invokes a separate tool-free reviewer. Exact argument-free cd with execution metadata has a narrow shortcut. Deterministic dangerous matches, explicit ask rules and forceHuman still require a person.

The host accepts only validated bounded low-risk actions with explicit/implicit authorization, or medium-risk actions with explicit authorization, known effects, valid user-message references and no sensitive-data/security-change flags. High, critical and unknown risks go to the user. A changed operation, settings or authorization context invalidates the assessment.

## Evidence and privacy

The same conversation profile may receive prior file observations and up to six scoped literal/package/test candidates: reads are bounded to 128,000 bytes per file and transmitted excerpts to 12,000 characters. Hashes and truncation flags accompany sources; npm pre/main/post scripts and recent same-run command observations may contribute. Imports and test discovery are not exhaustive.

A separately selected reviewer does not automatically receive code or command logs. Source text is untrusted data, never an instruction. File hashes are checked again after review; this is not a filesystem lock. Host execution is described with host network/file authority, not the native backend's restrictions.

## Failure and user decisions

Preparation, provider, invalid response, deadline and cancellation failures remain distinct. No failure authorizes an operation; raw provider error bodies are not exposed. Cards distinguish missing authorization, process ownership and incomplete evidence from reviewer unavailability. Broad process-name cleanup needs human scope review: cwd is not a process boundary.

The user can allow once, deny or request an alternative with constraints. An alternative denies the original operation and returns feedback for replanning; it cannot rewrite and silently execute a different command. Approval waiting does not consume execution timeout.

## Cache and audit

Stable policy/environment fields precede changing evidence/actions. Identical in-flight reviews can share computation only under the same run/configuration/evidence/cancellation context. Completed results are evicted; each caller rechecks sources. This is not a reusable permission grant.

Audit cards expose policy, rationale, duration, input/cached/output tokens and estimated cost separately from chat. Cache hits come from measured usage. Models can misclassify; zero test false approvals is not a safety proof. See [historical evaluation](APPROVAL-EVALUATION.md) and [security](SECURITY.md).
