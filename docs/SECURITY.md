# Security model

AgentDemo binds to loopback. It validates the Host header, uses an HttpOnly SameSite cookie, checks local origins and requires a CSRF token for mutations. It is a single-user desktop service, not an authenticated multi-user server.

File tools allow only authorized roots. Traversal, symlink/junction paths, hard-linked files, repository metadata and application private storage are rejected. These checks mitigate accidental escape; they are not an OS sandbox and do not eliminate filesystem TOCTOU races against a malicious concurrent local process.

Command execution:

- Read-only conversations cannot execute commands. Isolated writable children can use an OS isolation backend, but never the host execution backend.
- Personal chats have no project command capability.
- Ask mode requires approval of the concrete command, directory and timeout.
- Trusted mode must be explicitly selected by the user.
- Host execution has host-user authority. Selected environment variables are passed without model API keys; this is hygiene, not isolation.
- Docker mode disables network, drops capabilities, limits memory/PIDs/CPU, mounts only the chosen project folder and makes the container root filesystem read-only. Docker daemon/image availability is required. No host fallback is allowed.

Public web fetching resolves and pins DNS for each redirect, rejecting private, loopback, link-local and nonstandard-port destinations. It cannot reach the local AgentDemo control API. Model/embedding endpoints are separately configured by the user and may be localhost services.

MCP server activation trusts the configured executable to start with host-user rights. It is disabled until enabled in Settings. Tool calls have separate interactive approvals. MCP descriptions and skill instructions do not grant permissions.

Document content, retrieved text, memory and skill bodies are untrusted task data. Prompt wording alone is not the security boundary.

A machine administrator or malicious local program with access to the user account can read local data and credentials. Keys are not encrypted in an OS vault in this version. Keep `.data` and `.diagnostics` private and out of source control.

Test success is not a sandbox security certification. Native AppContainer file boundaries and timeout were subsequently tested on Windows; strict offline preflight refused execution on this computer. Docker remains unverified here. See MIGRATION.md for cleanup, copy and merge limitations.
