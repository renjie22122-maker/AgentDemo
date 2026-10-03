# Security model

AgentDemo binds to loopback. It validates the Host header, uses an HttpOnly SameSite cookie, checks local origins and requires a CSRF token for mutations. It is a single-user desktop service, not an authenticated multi-user server.

File tools allow only authorized roots. Traversal, symlink/junction paths, hard-linked files, repository metadata and application private storage are rejected. These checks mitigate accidental escape; they are not an OS sandbox and do not eliminate filesystem TOCTOU races against a malicious concurrent local process.

Command execution:

- Read-only conversations cannot execute commands. Isolated writable children can use an OS isolation backend, but never the host execution backend.
- Personal chats have no project command capability.
- Ask mode requires approval of the concrete command, directory and timeout. File-tool writes are scoped but do not require approval by default; enable **Approve file writes** in Settings to request approval for each mutation outside Trusted mode.
- Trusted mode must be explicitly selected by the user. Isolated children of Trusted parents start in Ask mode; trust is not automatically delegated.
- Fresh installations default to AppContainer on Windows and Docker elsewhere. Existing configurations retain their chosen backend. Missing isolation prerequisites reject commands; there is no automatic host fallback.
- Host execution has host-user authority. Selected environment variables are passed without model API keys; this is hygiene, not isolation.
- Docker defaults to UID:GID `1000:1000` (configurable), masks existing `.git`/`.agentdemo` directories, and rejects linked entries or metadata pointer files that cannot safely be masked. Docker mode disables network, drops capabilities, limits memory/PIDs/CPU, mounts only the chosen project folder and makes the container root filesystem read-only. Docker daemon/image availability is required. No host fallback is allowed.

Public web fetching resolves and pins DNS for each redirect, rejecting private, loopback, link-local and nonstandard-port destinations. It cannot reach the local AgentDemo control API. Model/embedding endpoints are separately configured by the user and may be localhost services.

MCP server activation trusts the configured executable to start with host-user rights. It is disabled until enabled in Settings. Tool calls have separate interactive approvals. MCP descriptions and skill instructions do not grant permissions.

Document content, retrieved text, memory and skill bodies are untrusted task data. Prompt wording alone is not the security boundary.

A machine administrator or malicious local program with access to the user account can read local data and credentials. Windows Settings saves encrypt model, embedding and media keys with current-user DPAPI. Existing plaintext settings migrate on the next save. Encryption errors fail closed without plaintext fallback. Other platforms currently retain restricted local-file storage. DPAPI does not protect against a malicious process running as the same user. Keep `.data` and `.diagnostics` private and out of source control.

Test success is not a sandbox security certification. Native AppContainer file boundaries and timeout were subsequently tested on Windows; strict offline preflight refused execution on this computer. Docker remains unverified here. See MIGRATION.md for cleanup, copy and merge limitations.

### Metadata boundary validation

The current Windows native backend refuses command startup when the execution directory contains `.git` or `.agentdemo` (case-insensitive). A real test found that the attempted package-SID deny ACL did **not** prevent metadata reads, so that approach was withdrawn. Use a clean isolated copy for native execution; changing to host execution is an explicit loss of OS isolation. This is a fail-closed availability restriction, not a claim that selective native metadata isolation is solved. Docker masks are covered by contract tests; Docker integration has not been validated on this machine.

`resolve_effect` can present inspected evidence for an unresolved operation in the current conversation. Only a user confirmation resolves it; it never authorizes or replays the command. Known pre-start failures close their effect as `not_started`. Timeouts with uncertain execution remain unknown.

### Approval evidence and interrupted waiting

Approval waiting has no expiry and is outside command execution deadlines. A restart/stop cancels the in-memory waiter; the UI offers reassessment, never an implicit approval. File mutation effects begin after approval, so an unanswered file request is not an unknown write.

Approve for me may reuse up to three prior file observations (8,000 characters each) and read up to three literal script paths referenced by the proposed command (8,000 bytes per file). Reads use the current execution folder's FileScope; no shell expansion or script execution is used. npm-family commands may supply package.json as evidence. Source sharing is limited to the conversation's same profile; a separately selected reviewer gets no source. File hashes are rechecked after review. This is bounded evidence gathering, not a full dependency audit or adversarial filesystem lock.

Recovery automatically compares complete requested file contents and host-recorded edit postimage hashes before involving the user. The same checks run before a recovery model turn and before resolve_effect asks for confirmation. Mismatches, missing evidence and arbitrary command outcomes remain unresolved. Database existence alone does not prove a migration completed; no generic model-only resolver has been enabled.
