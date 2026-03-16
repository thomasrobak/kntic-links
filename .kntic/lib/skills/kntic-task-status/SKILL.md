---
name: kntic-task-status
description: Transitions KNTIC task manifest status using set-status.sh. Use when working on a KNTIC task manifest, updating task state, or finishing a task session. Validates against the ADR-001 FSM and atomically updates status, updated_at, and actions audit log.
---

# KNTIC Task Status Transition

## Purpose

This skill provides a structured, reliable way for agents to transition task manifest statuses in the KNTIC orchestration system. It replaces manual JSON editing with an atomic shell script that enforces the ADR-001 finite state machine.

## ⚠️ CRITICAL RULE

**Before you exit or finish your session, you MUST call `set-status.sh` to set the manifest to a terminal state.** Failure to do so leaves the task permanently stuck in `in_progress` — the orchestrator will never pick it up again.

- **Task complete →** set status to `ready_for_merge`
- **Blocked / ambiguous →** set status to `needs_review`

There is no other way out. The orchestrator's FSM only advances on these terminal states.

## Usage

```bash
.pi/skills/kntic-task-status/set-status.sh <manifest_path> <new_status>
```

### Parameters

| Parameter       | Description                                                    |
|-----------------|----------------------------------------------------------------|
| `manifest_path` | Path to the task manifest JSON file (e.g. `.kntic/manifests/SKILL-001.json`) |
| `new_status`    | One of: `todo`, `in_progress`, `refactoring`, `needs_review`, `ready_for_merge` |

### Allowed Statuses (Agent-Settable)

| Status            | When to use                                           |
|-------------------|-------------------------------------------------------|
| `todo`            | Reset a task to not-yet-started                       |
| `in_progress`     | You are actively working on the task                  |
| `refactoring`     | GIA failed; you are self-correcting                   |
| `needs_review`    | You are blocked and need human input                  |
| `ready_for_merge` | Work is complete; ready for GIA validation            |

### Forbidden Statuses

- `merged` — set only by the Orchestrator after GIA passes
- `backlog` — set only by humans

The script will reject these with exit code 1.

## Examples

```bash
# Mark task as complete
.pi/skills/kntic-task-status/set-status.sh .kntic/manifests/SKILL-001.json ready_for_merge

# Mark task as blocked
.pi/skills/kntic-task-status/set-status.sh .kntic/manifests/INIT-042.json needs_review
```

## What the Script Does

1. Validates the manifest path is under `.kntic/manifests/` and ends in `.json`
2. Validates the status is in the ADR-001 agent-allowed whitelist
3. Reads the existing manifest JSON
4. Updates the `status` field
5. Updates the `updated_at` timestamp (ISO 8601 UTC)
6. Appends an entry to the `actions` array with timestamp and new status
7. Writes atomically via temp file + rename (prevents corruption)
8. Exits 0 on success, 1 on any error

## Workflow

1. The orchestrator launches you with a prompt containing the manifest path
2. You do your work
3. **Before finishing**, call:
   ```bash
   .pi/skills/kntic-task-status/set-status.sh <manifest_path> ready_for_merge
   ```
   Or if blocked:
   ```bash
   .pi/skills/kntic-task-status/set-status.sh <manifest_path> needs_review
   ```
4. The orchestrator's supervisor loop detects the terminal status and closes the session
