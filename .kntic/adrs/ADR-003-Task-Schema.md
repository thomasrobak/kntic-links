# ADR 003: Task Manifest Schema

## Status: Accepted
## Context:
All task work items in KNTIC Pulse are stored as JSON files in `.kntic/manifests/`.
The dashboard needs to create and edit these manifests via a structured web form.
This ADR defines the canonical schema derived from auditing all existing manifests
(`INIT-001` through `INIT-005`, `BUG-001`, `REGEN-001`) and the orchestration rules
codified in ADR-001.

---

## Decision

### Top-Level Fields

| Field        | Type     | Required | Valid Values / Format                                                                                      | Description                                          |
|--------------|----------|----------|------------------------------------------------------------------------------------------------------------|------------------------------------------------------|
| `task_id`    | string   | ✅ Yes   | `[A-Za-z0-9_-]+` — e.g. `INIT-007`, `BUG-002`                                                             | Unique identifier; also the manifest filename stem.  |
| `title`      | string   | ✅ Yes   | Free text                                                                                                   | Short human-readable task title.                     |
| `description`| string   | ❌ No    | Free text                                                                                                   | Longer description of the task goal.                 |
| `status`     | string   | ✅ Yes   | `todo` \| `in_progress` \| `refactoring` \| `needs_review` \| `ready_for_merge` \| `merged` \| `backlog`  | ADR-001 state machine state.                         |
| `priority`   | string   | ❌ No    | `high` \| `medium` \| `low`                                                                                | Task urgency level.                                  |
| `requirements`| object  | ❌ No    | See sub-schema below                                                                                        | Structured specification of what the task must do.   |
| `context_scope`| object | ❌ No    | See sub-schema below                                                                                        | Files the agent is allowed to read or write.         |
| `verification`| object  | ❌ No    | See sub-schema below — **deprecated** (DASHBOARD-011)                                                       | Legacy field. No longer written by the dashboard UI. May exist in older manifests but is ignored by the orchestrator and GIA. |
| `notes`      | string   | ❌ No    | Free text                                                                                                   | Human or agent commentary; blocking reason etc.      |
| `created_at` | string   | ❌ No    | ISO 8601 datetime — set automatically on creation                                                          | Timestamp when the manifest was first created.       |
| `updated_at` | string   | ❌ No    | ISO 8601 datetime — updated automatically on every write                                                   | Timestamp of the last modification.                  |
| `depends_on` | array   | ❌ No    | Array of task ID strings (e.g. `["SEC-001", "INIT-005"]`)                                                  | Task IDs that must be in `merged` status before this task can be picked up by the orchestrator. Omit when empty (never `[]`). |
| `actions`    | array    | ❌ No    | Array of action-entry objects (see sub-schema below)                                                       | Ordered log of every agent session that touched this manifest. One entry is appended per session. |
| `gia_failure`| object   | ❌ No    | See `gia_failure` sub-schema below                                                                         | Written by the Orchestrator when GIA rejects a task (status → `refactoring`). Contains structured failure detail for agents. Removed on `merged`. Never set by agents. |

---

### `actions` Array — Action Entry Object

Each element of the `actions` array represents one agent session that wrote to the manifest.
Entries are appended (never mutated) so the array forms an immutable audit log.

| Field       | Type   | Required | Description                                                              |
|-------------|--------|----------|--------------------------------------------------------------------------|
| `timestamp` | string | ✅ Yes   | ISO 8601 UTC datetime of the write (`datetime.now(timezone.utc).isoformat()`). |
| `status`    | string | ✅ Yes   | The ADR-001 status that was set in this session.                         |
| `summary`   | string | ❌ No    | Optional one-line description of what changed (derived from `notes` or `description`; max 200 chars). |

**Append rule:** Every call to `POST /api/tasks` or `PATCH /api/tasks/{task_id}/status` appends exactly one
entry to `actions`. The agent must never remove or modify existing entries.

**API:** `GET /api/tasks/{task_id}/actions` returns the full actions array for a task, including its `task_id` and `title`.

---

### `depends_on` Field — Task Dependency Graph

The optional `depends_on` array declares ordering constraints between tasks. Each element is a `task_id` string referencing another manifest. The orchestrator will **not** pick up a `todo` or `refactoring` task unless every task in its `depends_on` list has `"status": "merged"`.

**Rules:**
- Follows the omission rule: omit `depends_on` entirely when there are no dependencies (never set `"depends_on": []`).
- The dependency check is **purely status-based**: a dependency is satisfied if and only if the referenced task's manifest has `"status": "merged"`.
- **Circular dependencies** are detected at pulse-time and reported as an error — the task is set to `needs_review` with a clear message.
- The orchestrator logs a message for each unmet dependency: `"⏳ SEC-002 blocked: waiting for SEC-001 (in_progress)"`.
- Dependency resolution is O(n) per pulse: all manifests are read once to build a status map, then `todo` tasks check their `depends_on` against the map.

**Example:**
```json
{
  "task_id": "SEC-002",
  "title": "Narrow orchestrator volume mounts",
  "status": "todo",
  "depends_on": ["SEC-001"]
}
```

---

### `gia_failure` Sub-Object — GIA Rejection Detail

Written by the Orchestrator when GIA rejects a `ready_for_merge` task and sets its status to `refactoring`. This field provides agents with the full failure context so they can target fixes precisely without re-running the test suite blind.

| Field             | Type   | Required | Description                                                                  |
|-------------------|--------|----------|------------------------------------------------------------------------------|
| `reason`          | string | ✅ Yes   | Human-readable failure summary (same as GIA report `reason`).                |
| `alignment_score` | float  | ✅ Yes   | Composite alignment score (0.0–1.0) at the time of rejection.               |
| `dimensions`      | object | ✅ Yes   | Per-dimension breakdown (bootstrap_integrity, hook_results, schema_compliance, security_isolation). Each dimension has `score`, `weight`, and `weighted` sub-keys. |
| `logs`            | string | ❌ No    | Concatenated stdout/stderr from failing hooks, truncated to 4000 chars from the tail. Contains the raw test/compliance output the agent needs to identify failures. |

**Lifecycle:**
- **Set** by the Orchestrator when GIA fails and status transitions to `refactoring`.
- **Persists** through `in_progress` so the agent can read it during its sprint.
- **Overwritten** if GIA fails again on a subsequent attempt (latest failure replaces previous).
- **Removed** when GIA passes and status transitions to `merged`.
- **Never** set to `null` or `{}` — omit entirely when absent (ADR-003 omission rule).
- **Never** written by agents — this is an Orchestrator-only field.

**Example:**
```json
"gia_failure": {
  "reason": "Hook(s) failed: 001-pytests.sh. Alignment score 0.5000 below threshold 1.0000",
  "alignment_score": 0.5,
  "dimensions": {
    "bootstrap_integrity": {"score": 1.0, "weight": 0.3, "weighted": 0.3},
    "hook_results":        {"score": 0.0, "weight": 0.5, "weighted": 0.0},
    "schema_compliance":   {"score": 1.0, "weight": 0.1, "weighted": 0.1},
    "security_isolation":  {"score": 1.0, "weight": 0.1, "weighted": 0.1}
  },
  "logs": "=== 001-pytests.sh ===\nFAILED tests/test_routes.py::test_status_change\nAssertionError: expected 200, got 404\n..."
}
```

---

### `requirements` Sub-Object

| Field                    | Type            | Description                                                       |
|--------------------------|-----------------|-------------------------------------------------------------------|
| `features`               | array of string | List of concrete feature requirements (user-visible behaviours).  |
| `outputs`                | array of string | Expected deliverable artefacts (files, test results, etc.).       |
| `memory_integration`     | array of string | `.kntic/MEMORY.MD` / ADR files the agent must create or update.   |
| `infrastructure_updates` | array of string | `kntic.yml` (Docker Compose) or Dockerfile changes required.      |
| `security`               | array of string | Security constraints the implementation must satisfy.             |
| `files_to_create`        | array of string | Explicit list of new files the agent must produce.                |
| `framework`              | string          | Technology/framework mandate (e.g. `"FastAPI with Jinja2"`).      |
| `bootstrap_protection`   | boolean         | If `true`, the orchestrator must not overwrite bootstrap state.   |

All sub-fields are optional; omit keys whose values would be `null` or `[]`.

---

### `context_scope` Sub-Object

| Field          | Type            | Description                                                                              |
|----------------|-----------------|------------------------------------------------------------------------------------------|
| `read_only`    | array of string | Paths the agent may read but must not modify (maps to `:ro` volume mounts, ADR-002).     |
| `write_access` | array of string | Paths the agent is explicitly permitted to write (must be justified in `notes`).         |

---

### `verification` Sub-Object — **DEPRECATED** (DASHBOARD-011)

> **Removed from the dashboard UI as of DASHBOARD-011.** GIA uses hook scripts
> unconditionally (see ADR-004 §7) and never reads `test_command` or
> `required_coverage` from the manifest. The sub-object may still appear in
> legacy manifests but is no longer written by the dashboard and should not be
> relied upon by any tooling.

| Field              | Type   | Description                                                       |
|--------------------|--------|-------------------------------------------------------------------|
| `test_command`     | string | _(deprecated)_ Shell command to run the test suite.               |
| `required_coverage`| number | _(deprecated)_ Minimum code-coverage percentage.                  |
| `result`           | string | _(deprecated)_ Recorded result of the last test run.              |

---

## Status State Machine (ADR-001 Reference)

```
                    ┌─────────────────────┐
                    ▼                     │
todo  →  in_progress  →  ready_for_merge  →  merged
              │    ↖
              ▼      └────── refactoring
         needs_review

backlog  →  (human refines)  →  todo
```

| Status            | Set By             | Meaning                                               |
|-------------------|--------------------|-------------------------------------------------------|
| `todo`            | Human/Orchestrator | Task defined, not yet started.                        |
| `in_progress`     | Agent              | Agent is actively working on the task.                |
| `refactoring`     | Agent              | Validation failed; agent is self-correcting.          |
| `needs_review`    | Agent              | Blocked — human must answer before work can resume.   |
| `ready_for_merge` | Agent              | Work complete; awaiting GIA + human approval.         |
| `merged`          | Orchestrator       | GIA passed; Orchestrator sets this status immediately after the GIA PASSED log line, before commit/push. Push failure does not revert `merged` — the status reflects a successful GIA, not push success. |
| `backlog`         | Human              | Needs further refinement; human must promote to `todo` manually. |

> ⚠️ The status `"done"` does **not** exist in this system.

---

## Omission Rule

**Fields that the user leaves blank must be omitted from the saved JSON entirely.**
They must not appear as `null`, `""`, or `[]`.
This keeps manifests minimal and prevents the orchestrator from misinterpreting
empty arrays as "no requirements" versus "requirements not specified".

The dashboard form enforces this rule before `POST /api/tasks`: any field whose
value is an empty string, empty array, or `null` is stripped from the payload.

---

## Canonical Minimal Example

```json
{
  "task_id": "INIT-007",
  "title": "Example minimal task",
  "status": "todo"
}
```

## Canonical Full Example

```json
{
  "task_id": "INIT-007",
  "title": "Example full task",
  "description": "Demonstrate every field in the schema.",
  "status": "todo",
  "priority": "medium",
  "depends_on": ["INIT-006"],
  "requirements": {
    "features": [
      "Feature A",
      "Feature B"
    ],
    "outputs": [
      "src/example.py"
    ],
    "memory_integration": [
      "Update .kntic/MEMORY.MD"
    ],
    "infrastructure_updates": [
      "Add service to kntic.yml"
    ],
    "security": [
      "Use read-only volume mounts"
    ],
    "files_to_create": [
      "src/example.py"
    ]
  },
  "context_scope": {
    "read_only": [
      ".kntic/adrs/",
      ".kntic/lib/skills/validator.py"
    ],
    "write_access": [
      "src/",
      ".kntic/MEMORY.MD"
    ]
  },
  "notes": "Additional context or blocking reason goes here.",
  "actions": [
    {
      "timestamp": "2026-02-20T15:00:00.000000+00:00",
      "status": "in_progress",
      "summary": "Agent started work on the task."
    },
    {
      "timestamp": "2026-02-20T15:30:00.000000+00:00",
      "status": "ready_for_merge",
      "summary": "All requirements implemented; tests pass."
    }
  ]
}
```

---

## Consequences

- **Structured form**: The dashboard modal renders one labelled input per schema field,
  replacing the raw JSON textarea. Users never need to write JSON manually.
- **Omission enforcement**: Empty inputs are silently dropped before the API call,
  keeping manifests clean and minimal.
- **Schema evolution**: Any new field added to manifests must be documented here first
  so both the dashboard form and the orchestrator stay in sync.
- **Immutable action log**: The `actions` array is append-only. The dashboard API
  (`POST /api/tasks`, `PATCH …/status`) appends one entry per call. Agents and
  humans must never remove or reorder entries. The Actions modal in the UI renders
  them newest-first for readability.
