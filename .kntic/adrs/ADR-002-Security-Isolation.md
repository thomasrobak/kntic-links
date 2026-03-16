# ADR 002: Security Isolation — Least Privilege Volume Mounting

## Status: Accepted

## Context

When the KNTIC Pulse dashboard was first containerized (INIT-002), the initial
`kntic.yml` (Docker Compose file) mounted the entire project root (`.:/app`) into the dashboard
container. This gave the user-facing web service unrestricted read/write access to
every file in the repository — including the orchestrator source, agent memory,
hook scripts, and Git metadata.

This violated the principle of least privilege: a web-facing service should only
have access to the files it needs to function. A vulnerability in the dashboard
(e.g. path traversal, template injection, dependency exploit) could allow an
attacker to read secrets, modify orchestrator logic, or tamper with GIA results.

The decision was made during INIT-002 to replace the root-level mount with
granular, purpose-specific volume mounts. Subsequent tasks (BUG-001, BUG-002)
discovered that file ownership and permissions also required hardening to ensure
non-root container users could write to manifests without granting excessive
privileges.

---

## Decision

### 1. Core Principle

**Mount only what the service needs. Default to read-only.**

Every volume mount in `kntic.yml` must satisfy two rules:

1. **Necessity** — the service has a documented reason to access the path.
2. **Minimal privilege** — the mount is `:ro` (read-only) unless write access is
   explicitly required and justified.

The root project directory (`.:/app`) must **never** be mounted into the dashboard
container. The orchestrator service (`kntic-engine`) is the privileged engine and
currently mounts `.:/app` (full access) in `kntic.yml` — narrowing this scope is tracked as TD-1.

---

### 2. Dashboard Volume Configuration

The `kntic-dashboard` service uses the following volume mounts:

| Host Path                      | Container Path                     | Mode       | Justification                                  | Introduced In |
|--------------------------------|------------------------------------|------------|-------------------------------------------------|---------------|
| `./.kntic/gia`                 | `/app/.kntic/gia`                  | `:ro`      | GIA state file — read by health banner          | INIT-012      |
| `./.kntic/MEMORY.MD`           | `/app/.kntic/MEMORY.MD`            | `:ro`      | Project name extraction for dashboard header    | INIT-017      |
| `./.kntic/adrs`                | `/app/.kntic/adrs`                 | `:ro`      | ADR viewer page                                 | INIT-020      |
| `./src`                        | `/app/src`                         | `:ro`      | Application source code                         | INIT-002      |
| `./.kntic/lib/skills`          | `/app/.kntic/lib/skills`           | `:ro`      | Skill modules (validator, navigation)           | REGEN-003     |
| `./.kntic/manifests`           | `/app/.kntic/manifests`            | read/write | Manifest CRUD from the dashboard UI             | INIT-003      |
| `./.kntic/docs`                | `/app/.kntic/docs`                 | read/write | PROPOSAL-Acceptance                             | DASHBPARD-003 |


**Adding a new mount** requires:
- Documenting the justification in this table.
- Defaulting to `:ro` unless write access is necessary.
- If write access is required, documenting the reason in the task manifest's
  `notes` field and updating this ADR.

---

### 3. Non-Root Container Execution

Both services run as a non-root user to limit the blast radius of any container
escape or file-system vulnerability:

```yaml
user: "${UID}:${GID}"
```

- `UID` and `GID` are resolved from the host environment (via `.kntic.env` file),
  defaulting to `1000:1000`.
- This maps to the `node` group inside the container, which is why manifest
  files must be group-writable.

---

### 4. Manifest File Permissions

All manifest files in `.kntic/manifests/` must have:

```
chmod 664    (owner rw, group rw, other r)
chown root:node
```

This ensures:
- The non-root container user (GID 1000 / `node` group) retains write access
  to manifests created by any process.
- No file requires root privileges to modify from within the container.

**Any newly created manifest file** must receive these permissions immediately
after creation. BUG-001 discovered that the default `root:root / 644` ownership
prevented the dashboard from updating manifests. BUG-002 confirmed that files
created after the initial fix regressed to `root:root / 644` unless permissions
were explicitly set.

---

### 5. API Authentication (SEC-001)

The dashboard API supports **bearer token authentication** to protect all
endpoints from unauthorized access. The token is configured via the
`DASHBOARD_AUTH_TOKEN` environment variable in `.kntic.env`.

**Authentication modes:**

| Mode | Condition | Behaviour |
|------|-----------|-----------|
| **Open mode** | `DASHBOARD_AUTH_TOKEN` is empty or absent | All endpoints accessible without authentication. A warning banner is displayed in the UI. Backward-compatible with local development. |
| **Authenticated mode** | `DASHBOARD_AUTH_TOKEN` is set | All API endpoints and UI pages require a valid token. Unauthenticated requests receive 401. |

**Token delivery mechanisms (authenticated mode):**

1. **`Authorization: Bearer <token>`** header — for programmatic API access.
2. **`kntic_session` cookie** — set by `POST /api/auth/login`; HttpOnly,
   SameSite=Strict. Used by the browser-based dashboard UI.
3. **WebSocket query parameter** — `/ws?token=<token>` for live connections;
   falls back to the session cookie.

**Security properties:**
- Token comparison uses `hmac.compare_digest` (constant-time) to prevent
  timing attacks.
- The token value is never logged, included in error messages, or exposed in
  the dashboard UI source.
- Failed authentication returns `401 Unauthorized` with `{"detail": "Unauthorized"}`
  — no information leakage.
- Session cookies are HttpOnly and SameSite=Strict; `Secure` flag is set
  automatically when served over HTTPS.

**Endpoints:**

| Endpoint | Method | Auth Required | Purpose |
|----------|--------|---------------|---------|
| `/login` | GET | No | Login page (redirects to `/` in open mode) |
| `/api/auth/login` | POST | No (validates token) | Exchange token for session cookie |
| `/api/auth/logout` | POST | No | Clear session cookie |
| `/api/auth/status` | GET | No | Check current auth state |
| All other endpoints | * | Yes (when configured) | Protected by `require_auth` dependency |

---

### 6. Write Access Escalation Protocol

When a task requires write access to a path that is currently mounted as `:ro`
or not mounted at all:

1. The task manifest's `context_scope.write_access` must list the path.
2. The manifest's `notes` field must justify why write access is needed.
3. The `kntic.yml` mount must be added or changed from `:ro` to
   read/write.
4. This ADR's volume table (§2) must be updated to reflect the change.

Write access is never granted implicitly. If a mount is not documented in this
ADR, it should not exist in `kntic.yml`.

---

### 7. Relationship to Other ADRs

| ADR     | Relationship                                                                     |
|---------|----------------------------------------------------------------------------------|
| ADR-001 | The manifest state machine relies on writable access to `.kntic/manifests/` — this ADR documents that as the sole write mount for the dashboard. |
| ADR-003 | The task schema's `context_scope` sub-object (`read_only`, `write_access`) maps directly to the volume mount policy defined here. |
| ADR-004 | The GIA state file contract specifies that the dashboard mount for `.kntic/gia/` must be `:ro` — enforced by this ADR's volume table. |

---

## Consequences

- **Dashboard is sandboxed:** Even if a vulnerability is exploited, the attacker
  can only write to `.kntic/manifests/` — not to source code, orchestrator logic,
  GIA state, or agent memory.
- **New mounts require documentation:** Contributors cannot silently add volume
  mounts without updating this ADR, ensuring the security posture is auditable.
- **Permission discipline:** Every manifest file creation path (dashboard API,
  orchestrator, manual) must apply `chmod 664 / chown root:node` — failure to
  do so will break dashboard write access (as demonstrated by BUG-001, BUG-002).
- **Orchestrator scope is broader:** The `kntic-engine` service still mounts the
  full project root. Narrowing this to specific paths is tracked as TD-1 and
  should be addressed as a future security hardening task.
