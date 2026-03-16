# MEMORY.MD — Persistent Working Memory

>
> **Last Updated:** 2026-03-16

---

## 1. Current Project State

**Project:** KNTIC Pulse
**Repository:** *(update with your gitlab host/group/project)*

### Completed Tasks (Merged)
| Task ID | Title | Key Output |
|---------|-------|------------|
| *(none yet)* | | |

### Active Services
- **Dashboard** → `http://localhost:8000`
- **Orchestrator** → `kntic-engine` container

---

## 2. Architectural Constraints

Refer to `.kntic/adrs/` for all platform-level constraints:

| ADR | File | Title | Key Rule |
|-----|------|-------|----------|
| ADR-001 | ADR-001-Bootstrapping.md | Manifest-Driven Orchestration | FSM statuses: todo, in_progress, refactoring, needs_review, ready_for_merge, merged, backlog |
| ADR-002 | ADR-002-Security-Isolation.md | Security Isolation — Least Privilege | Mount only what the service needs; default `:ro`; dashboard sandboxed |
| ADR-003 | ADR-003-Task-Schema.md | Task Manifest Schema | Required fields: task_id, title, status; omission rule (no null/empty) |
| ADR-004 | ADR-004-GIA-State-File-Contract.md | GIA State File Contract | `.kntic/gia/state.json` — atomic writes; pass/fail only; dashboard read-only |
| ADR-005 | ADR-005-Technical-Debt-Task-Convention.md | Technical Debt Task Convention | TD- prefix; mandatory MEMORY.MD §3 update on resolution |
| ADR-006 | ADR-006-ADR-Guidelines.md | ADR Guidelines | Mandatory sections: Title, Status, Context, Decision, Consequences |
| ADR-007 | ADR-007-Proposal-Format-And-Handling.md | Proposal Format and Handling | Proposals in `.kntic/docs/`; feeds into ADR pipeline |

---

## 3. Known Technical Debt

| ID | Description | Severity | Origin |
|----|-------------|----------|--------|
| TD-1 | Orchestrator (`kntic-engine`) mounts `.:/app` full project root — should be narrowed to specific paths for least-privilege compliance. | Medium | ADR-002 §1 |

---

## 4. Active Protocol Notes

### For Task Agents
1. **Read this file first** at the start of every session.
2. **Update this file last** after completing a task.
3. **Manifest lifecycle:** `in_progress` → `ready_for_merge`. Orchestrator sets `merged`.
4. **Scope discipline:** Only read/write files listed in your manifest's `context_scope`.
5. **Security first:** Default to `:ro` for volume mounts. Escalate only with justification (ADR-002 §6).
6. **Actions log:** Append one entry to the manifest's `actions` array per session (ADR-003).
7. **New manifests:** Apply `chmod 664` + `chown root:node` immediately after creating (ADR-002 §4).

### Volume Mount Strategy (ADR-002)
- Dashboard mounts are granular and `:ro` by default.
- Only `.kntic/manifests/` and `.kntic/docs/` are writable by the dashboard.
- The orchestrator (`kntic-engine`) currently mounts `.:/app` full access — narrowing this is tracked as TD-1 in ADR-002.
- Write access escalation requires manifest justification + ADR-002 §2 table update.

---

## 5. [Questions for Human]

_No open questions._

---

## 6. [Additional Info from Human]

_No additional info yet._
