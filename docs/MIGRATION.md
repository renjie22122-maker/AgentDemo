# Installation, upgrades and execution backends

[English](MIGRATION.md) | [简体中文](MIGRATION.zh-CN.md) · [Documentation](README.md)

Reviewed: 2026-10-06.

## Amadeus rename and startup

Install Node.js 24+ including npm. First-Start-Amadeus.cmd installs locked dependencies using pnpm 11.19.0, checks TypeScript, builds backend JavaScript/runtime assets and the UI and starts the service. Start-Amadeus.cmd also prepares missing/changed dependencies and rebuilds changed source.

First Start refuses dependency replacement while an existing service is running. Quick Start opens a running service, warns if local build inputs changed, and does not interrupt tasks or hot-update it. Finish tasks, stop the service and launch again to apply an update. Logs remain under .data/logs.

Old AgentDemo launcher names forward to the new scripts. Legacy default assistant names become Amadeus; custom names survive. .data, AGENTDEMO_* environment variables, browser storage/cookie keys, package-signature filename and sandbox identity namespace retain compatibility names. They are not obsolete branding to rename manually. Local checkout paths need not change.

Back up private data before moving an installation. Copying the repository alone does not migrate it. DPAPI secrets are tied to the Windows account; moving to another user/machine may require entering keys again. No old Agent4Learning Python package is imported at runtime.

## AppContainer

TypeScript communicates with native/windows/bridge.py over JSON stdin/stdout. The standalone Python adapter manages AppContainer profiles, ACL grants, suspended process launch and a kill-on-close Job Object. A configured absolute Python interpreter is required. Its standard library is materialized into private native-python storage; host conda site-packages are not implicitly exposed.

File-isolation mode allows networking; strict offline requires a denial preflight. Preflight failure rejects commands without host fallback. Directories with protected metadata currently refuse native startup. Stop, timeout and EOF terminate owned work; abrupt adapter death can leave ACL/profile artifacts. Automatic crash cleanup of all such artifacts is not implemented.

## Docker and host

Docker needs the engine and a preinstalled image (pull=never), uses a non-root user, offline networking and scoped mounts. Validate it on the deployment host. Host mode intentionally runs with host-account authority and requires explicit selection; it is not an OS sandbox.

## Writable workers

Isolated workers copy authorized folders without hard links; copies are bounded to 10,000 regular files/64 MB and exclude hidden/dependency/build/link/private entries. Missing copied dependencies do not prove the host installation is broken. Child commands require OS isolation; host command execution and external MCP are unavailable.

Review changes returns diffs/conflicts and a version. Merge needs explicit approval and unchanged parent/version hashes; binary conflicts need manual handling. Per-file journaling exposes partial results, not an atomic multi-file transaction. Merged copies cannot continue writing.

## Upgrade checks

Run pnpm check, pnpm test and pnpm build. Public sanitized tests are included. Native desktop/browser integrations need explicit host opt-in. Historical migration measurements are archived in [history](history/README.md); they are not current configuration requirements.
