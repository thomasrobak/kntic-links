# ADR 004: GIA State File Contract

## Status: Accepted

## Context

The Global Impact Analysis (GIA) mechanism was first introduced in `INIT-001` and partially
decoupled from the Dashboard in `INIT-012`. Before this ADR existed, the contract between
the Orchestrator (writer) and the Dashboard (reader) was only described implicitly in code
comments and `MEMORY.MD` notes (TD-3).

Without a formal specification, any future change to `validator.py`, `gia.py`, or the
Dashboard WebSocket watcher could silently break the health-status integration — because
there was no normative source of truth for the file's path, schema, write semantics, or
error-handling expectations.

This ADR closes TD-3 by documenting the **complete contract** for the GIA state file as
it exists in the current implementation.

---

## Decision

### 1. Architecture Overview

The GIA subsystem follows a **producer / consumer** pattern with a shared file as the
inter-process boundary:

```
┌─────────────────────────────────────┐          ┌─────────────────────────────────────┐
│          kntic-engine               │          │         kntic-dashboard             │
│  (.kntic/lib/skills/validator.py)   │  writes  │    (src/dashboard/gia.py)           │
│                                     │ ───────► │                                     │
│  KineticValidator.execute_gia()     │          │  get_system_health()                │
│  _write_gia_state()                 │          │  (read-only consumer)               │
└─────────────────────────────────────┘          └─────────────────────────────────────┘
                                           ▲
                                    .kntic/gia/state.json
                                    (canonical shared state)
```

**Key constraint:** The Dashboard **never** spawns a GIA subprocess. It only reads
`state.json`. This decoupling ensures the Dashboard stays lightweight and stateless,
and prevents race conditions from concurrent GIA executions.

---

### 2. Canonical File Path

```
.kntic/gia/state.json
```

- **Absolute path inside containers:** `/app/.kntic/gia/state.json`
- The directory `.kntic/gia/` is created automatically by `_write_gia_state()` on first
  write if it does not yet exist (`os.makedirs(..., exist_ok=True)`).
- The path is defined as a module-level constant in **both** producer and consumer:
  - Producer: `GIA_STATE_PATH = os.path.join(".kntic", "gia", "state.json")` — `validator.py`
  - Consumer: `GIA_STATE_PATH = Path(".kntic") / "gia" / "state.json"` — `gia.py`
- Any future path change **must** be made in both files simultaneously.

---

### 3. State File Schema

The file is a single JSON object. All top-level fields are described below.

#### 3.1 Common Fields (always present after a write)

| Field              | Type             | Description                                                                                      |
|--------------------|------------------|--------------------------------------------------------------------------------------------------|
| `status`           | string           | GIA result. See §3.2 for valid values.                                                           |
| `last_checked`     | string           | ISO 8601 UTC timestamp of the GIA run that produced this file. Set by `_write_gia_state()`. |
| `alignment_score`  | float            | Continuous Alignment Score (0.0–1.0) per Whitepaper §3 (GIA-001).                               |
| `dimensions`       | object           | Per-ADR sub-score breakdown. Keys: `bootstrap_integrity`, `hook_results`, `schema_compliance`, `security_isolation`. Each value is `{"score": float, "weight": float, "weighted": float}`. (GIA-001) |
| `change_delta`     | integer          | Number of files changed relative to `main` (min 1). (GIA-001)                                   |
| `merge_threshold`  | float            | Configurable minimum alignment_score for a "pass" result. Default: 1.0. (GIA-001)               |

#### 3.2 `status` Values

| Value    | Meaning                                              | Set When                                             |
|----------|------------------------------------------------------|------------------------------------------------------|
| `"pass"` | All hooks passed and bootstrap integrity is intact.  | `execute_gia()` succeeds end-to-end.                 |
| `"fail"` | At least one check failed.                           | Bootstrap protection fails **or** any hook exits non-zero. |

No other `status` values are written by the Orchestrator. The Dashboard treats any
unrecognised value as `"critical"`.

#### 3.3 Conditional Fields

| Field              | Type             | Present When         | Description                                                                 |
|--------------------|------------------|----------------------|-----------------------------------------------------------------------------|
| `files_validated`  | array of string  | `status == "pass"`   | List of files changed relative to `main` (output of `git diff --name-only main`). May be empty `[]` if no files differ. |
| `reason`           | string           | `status == "fail"`   | Human-readable explanation of the failure.                                  |
| `logs`             | string           | Hook failure only    | Combined stdout/stderr of all failed hooks, concatenated as plain text.     |
| `drift_items`      | array of object  | Always (REGEN-006)   | Structural drift items detected by drift detection hooks. Empty array when no drift. Each object: `{"type": string, "file": string, "line": int, "detail": string}`. Types: `stale_reference`, `adr_memory_desync`, `symlink_broken`, `symlink_missing`, `symlink_wrong_target`, `td_resolution_inconsistency`, `missing_file`. |

#### 3.4 Canonical Examples

**Pass:**
```json
{
  "status": "pass",
  "files_validated": [
    ".kntic/MEMORY.MD",
    ".kntic/manifests/INIT-014.json"
  ],
  "alignment_score": 1.0,
  "dimensions": {
    "bootstrap_integrity": {"score": 1.0, "weight": 0.3, "weighted": 0.3},
    "hook_results":        {"score": 1.0, "weight": 0.5, "weighted": 0.5},
    "schema_compliance":   {"score": 1.0, "weight": 0.1, "weighted": 0.1},
    "security_isolation":  {"score": 1.0, "weight": 0.1, "weighted": 0.1}
  },
  "change_delta": 2,
  "merge_threshold": 1.0,
  "last_checked": "2026-02-20T23:21:22.973340+00:00"
}
```

**Fail — bootstrap protection:**
```json
{
  "status": "fail",
  "reason": "Bootstrap Protection: Core logic is broken or unimportable.",
  "alignment_score": 0.7,
  "dimensions": {
    "bootstrap_integrity": {"score": 0.0, "weight": 0.3, "weighted": 0.0},
    "hook_results":        {"score": 1.0, "weight": 0.5, "weighted": 0.5},
    "schema_compliance":   {"score": 1.0, "weight": 0.1, "weighted": 0.1},
    "security_isolation":  {"score": 1.0, "weight": 0.1, "weighted": 0.1}
  },
  "change_delta": 1,
  "merge_threshold": 1.0,
  "last_checked": "2026-02-20T22:10:00.000000+00:00"
}
```

**Fail — hook failure:**
```json
{
  "status": "fail",
  "reason": "Hook(s) failed: 001-pytests.sh. Alignment score 0.5000 below threshold 1.0000",
  "logs": "=== 001-pytests.sh ===\nFAILED tests/test_routes.py::test_status_change\n...",
  "alignment_score": 0.5,
  "dimensions": {
    "bootstrap_integrity": {"score": 1.0, "weight": 0.3, "weighted": 0.3},
    "hook_results":        {"score": 0.0, "weight": 0.5, "weighted": 0.0},
    "schema_compliance":   {"score": 1.0, "weight": 0.1, "weighted": 0.1},
    "security_isolation":  {"score": 1.0, "weight": 0.1, "weighted": 0.1}
  },
  "change_delta": 3,
  "merge_threshold": 1.0,
  "last_checked": "2026-02-20T22:15:00.000000+00:00"
}
```

---

### 4. Write Semantics (Producer)

#### 4.1 Atomic Write (temp → rename)

To prevent the Dashboard from reading a partial or corrupt file, `_write_gia_state()`
always writes to a temporary path first, then atomically replaces the target:

```python
tmp_path = GIA_STATE_PATH + ".tmp"   # e.g. .kntic/gia/state.json.tmp
with open(tmp_path, "w") as fh:
    json.dump(state, fh, indent=2)
os.replace(tmp_path, GIA_STATE_PATH) # atomic on POSIX; best-effort on Windows
```

`os.replace()` is an atomic rename on POSIX systems (Linux, macOS). On Windows it is
not atomic but still safe for this use-case as both files are on the same filesystem.

#### 4.2 Write Timing

`_write_gia_state()` is called **inside** `execute_gia()`, unconditionally, for both
pass and fail outcomes. The state file is always up to date after any GIA run, even if
the run results in failure.

#### 4.3 Write Failure Handling

If the state file cannot be written (e.g. permissions error, disk full), the exception
is caught and logged as a warning — it does **not** abort the GIA or affect the return
value of `execute_gia()`. The Orchestrator continues the merge/refactor decision based
on the in-memory report. The Dashboard will continue to show the previous (stale) state
until the next successful write.

---

### 5. Read Semantics (Consumer)

The Dashboard reads the state file on demand via `get_system_health()`.
It translates the raw GIA schema into a presentation-layer
health dict:

```python
{
  "status":       "healthy" | "degraded" | "critical" | "unknown",
  "label":        str,    # emoji-prefixed short string for the UI banner
  "color":        "green" | "yellow" | "red" | "grey",
  "detail":       str,    # longer explanation shown on hover / expansion
  "last_checked": str | None,  # ISO 8601 from the state file, or None
}
```

#### 5.1 GIA status → Dashboard health mapping

| GIA `status` | Dashboard `status` | `color` | `label`                    |
|--------------|--------------------|---------|----------------------------|
| `"pass"`     | `"healthy"`        | green   | ✅ All systems nominal      |
| `"fail"`     | `"degraded"`       | yellow  | ⚠️ GIA reported issues     |
| *(any other)*| `"critical"`       | red     | 🔴 GIA status unknown      |
| *(file absent)*| `"unknown"`      | grey    | ⏳ Awaiting Pulse           |
| *(parse error)*| `"critical"`     | red     | 🔴 GIA state unreadable    |

#### 5.2 Missing File Behaviour

If `state.json` does not exist (first boot, GIA has never run, or file was deleted),
`get_system_health()` returns the `"unknown"` / `"⏳ Awaiting Pulse"` health dict.
**It never raises an exception** to the caller.

#### 5.3 Read Frequency

`get_system_health()` is called by:
1. **`_build_broadcast_payload()`** in `ws_manager.py` — every time a file-system change
   is detected in `.kntic/manifests/` or `.kntic/gia/state.json`.
2. **Initial WebSocket connect** — the first broadcast payload sent to a newly connected
   client includes the current health state.
3. **Long-poll fallback** — `GET /api/manifests` does **not** include health; a full page
   reload is required to re-sync health when the WebSocket is unavailable.

---

### 6. Volume Mount Requirements

The `state.json` file crosses a container boundary. Both services must have access:

| Service            | Mount Path                          | Mode         | Justification                                 |
|--------------------|-------------------------------------|--------------|-----------------------------------------------|
| `kntic-engine`     | `.kntic/gia` → `/app/.kntic/gia`    | **read/write** | Orchestrator writes `state.json` after each GIA run. |
| `kntic-dashboard`  | `.kntic/gia` → `/app/.kntic/gia`    | **read-only (`:ro`)** | Dashboard only reads; write access is not required (ADR-002). |

This is enforced in `kntic.yml`. Any change to these mounts must be reflected
here and in `MEMORY.MD §2.2`.

---

### 7. Hook Discovery & Execution

GIA is extensible via hook scripts organised in two subdirectories under
`.kntic/hooks/gia/`. This separation (introduced in GIA-003) allows kntic-internal
compliance checks to coexist with project-specific quality gates without interference.

#### 7.1 Directory Structure

```
.kntic/hooks/gia/
├── specific/      ← Project-specific hooks (unit tests, linting, build checks, etc.)
│   ├── 001-pytests.sh
│   └── 002-bootstrap-sync.sh
└── internal/      ← Kntic-internal hooks (ADR compliance, schema validation, etc.)
    └── 001-adr-compliance.py
```

- **`specific/`** — Contains hooks that are unique to the current project. Other
  projects adopting kntic would replace these with their own tests (e.g. Java unit
  tests, Go linting, Terraform validation). These run **first**.
- **`internal/`** — Contains hooks that enforce kntic's own architectural rules
  (ADR compliance, manifest schema checks). These run **after** specific hooks.
- **Legacy fallback** — If neither subdirectory exists but executable files are
  present directly in `.kntic/hooks/gia/`, those are discovered instead (backward
  compatibility for external projects that have not migrated to the two-directory layout).

#### 7.2 Discovery Rules

- `discover_hooks()` scans `specific/` first, then `internal/`.
- Within each directory, only **executable files** (`os.access(path, os.X_OK)`) are included.
- Files are sorted **lexicographically by basename** within each directory to give a
  deterministic execution order (e.g. `specific/001-pytests.sh` runs before
  `specific/002-bootstrap-sync.sh`, then `internal/001-adr-compliance.py`).
- Directories and non-executable files are silently skipped.
- If no hooks are found in either subdirectory or the legacy directory, GIA treats
  this as "no hooks" and returns a pass result.

#### 7.3 Execution Contract

- Each hook is run as a **subprocess** with stdout and stderr merged (`stderr=STDOUT`).
- Output is streamed **line-by-line** in real time (not buffered until exit) using
  `subprocess.Popen` with `bufsize=1`.
- Each output line is forwarded immediately to the validator log, prefixed with the hook
  name.
- **All hooks are always executed** — a failing hook does not short-circuit remaining
  hooks. All failures are collected and reported in a single GIA result.
- A hook **passes** if its process exits with code `0`.
- A hook **fails** if its process exits with any non-zero code, or if an exception is
  raised while spawning or reading from it.

#### 7.4 Current Hooks

| Directory   | File                      | Purpose                                       | Status    |
|-------------|---------------------------|-----------------------------------------------|-----------|
| `specific/` | `001-pytests.sh`          | Runs the full `pytest` regression suite       | Canonical |
| `specific/` | `002-bootstrap-sync.sh`   | Validates bootstrap template sync             | Canonical |
| `internal/` | `001-adr-compliance.py`   | Programmatic ADR compliance checks (ADR-001–007) | Canonical |
| `internal/` | `998-drift-stale-refs.py` | Drift detection: stale file references, ADR/MEMORY.MD table sync (REGEN-006) | Canonical |
| `internal/` | `999-drift-symlinks.py`   | Drift detection: symlink integrity, TD resolution consistency (REGEN-006) | Canonical |

---

## Consequences

- **Single source of truth:** The state file at `.kntic/gia/state.json` is the
  authoritative record of the last GIA result. No other mechanism (subprocess calls,
  API polling) should be used by the Dashboard to determine system health.
- **Schema stability:** Any new field added to the GIA report must be documented in
  §3 of this ADR before being written by the Orchestrator. The Dashboard must be
  updated to consume it.
- **Atomic write is mandatory:** Non-atomic writes risk a partial-read corruption that
  renders the health banner meaningless. The `temp → os.replace()` pattern must be
  preserved in any future rewrite of `_write_gia_state()`.
- **Extensibility:** New GIA checks must be implemented as hook scripts in
  `.kntic/hooks/gia/specific/` (project-specific) or `.kntic/hooks/gia/internal/`
  (kntic-internal), not by modifying `validator.py` core logic. This keeps the
  contract stable and the hooks independently testable.
- **Dashboard passivity:** The Dashboard must never trigger a GIA run. If an on-demand
  GIA capability is needed in the future, it must be implemented as a separate API
  endpoint that delegates to the Orchestrator, not a direct call from the Dashboard.
