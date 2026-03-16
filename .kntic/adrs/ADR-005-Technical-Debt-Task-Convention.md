# ADR 005: Technical Debt Task Convention (TD- Prefix)

## Status: Accepted

## Context

As the KNTIC Pulse orchestration platform grew across multiple sessions and task IDs,
a category of work emerged that does not map to a feature (`INIT-`), a bug (`BUG-`),
or a regeneration/migration (`REGEN-`). This category is **technical debt resolution**:
work items that address gaps, missing documentation, security weaknesses, or
architectural oversights that were deliberately deferred rather than blocking the
original task.

Technical debt items are tracked in `## 3. Known Technical Debt` inside
`.kntic/MEMORY.MD`. Before this ADR, there was no formal convention for how
debt-resolution tasks were named, what they were required to do beyond the code work
itself, or what constituted a successful resolution.

This ADR formalises the `TD-` task prefix convention and the obligations it carries.

---

## Decision

### 1. Naming Convention

All task manifests whose primary purpose is to resolve a technical debt item recorded
in `.kntic/MEMORY.MD §3` **must** use the `TD-` prefix followed by a zero-padded
three-digit number matching the debt's ID:

```
TD-001.json   →  Resolves TD-1 from MEMORY.MD
TD-002.json   →  Resolves TD-2 from MEMORY.MD
TD-003.json   →  Resolves TD-3 from MEMORY.MD
```

The task `title` in the manifest should be descriptive and reference the source debt
(e.g. `"Address TD-3 from MEMORY.MD"`).

---

### 2. Mandatory MEMORY.MD Update

**Every `TD-` prefixed task** carries an unconditional obligation to update
`.kntic/MEMORY.MD` when the task session ends — regardless of outcome:

#### 2.1 On Successful Resolution

When a TD- task completes and the agent sets the manifest status to `ready_for_merge`:

1. **Strike through the debt row** in `MEMORY.MD §3` using the `~~strikethrough~~`
   Markdown convention, consistent with how existing resolved debts are displayed
   (e.g. TD-4, TD-6, TD-7).
2. **Append a resolution note** to the stricken row explaining what was done to
   resolve it and which task/session resolved it.
3. **Promote the resolved debt** — replace the severity value with ✅ to make
   the resolution visible at a glance in the table.

**Example — before:**
```markdown
| TD-3 | GIA runner mechanism not formally specified in an ADR. | Low | INIT-001 / INIT-012 |
```

**Example — after:**
```markdown
| ~~TD-3~~ | ~~GIA runner mechanism not formally specified in an ADR.~~ **Resolved** — ADR-004 created; full GIA state-file contract documented (path, schema, atomic-write, read semantics, volume mounts, hook contract). | ~~Low~~ ✅ | TD-003 |
```

#### 2.2 On Failed Resolution / Blocked

When a TD- task cannot be fully resolved (agent sets `needs_review`, or the task is
partially complete and must be deferred):

1. **Do not strike through the debt row** — it remains open.
2. **Append a note** to the debt row with the date and a brief explanation of what
   was attempted and why it could not be completed.
3. **Add a `[Questions for Human]` entry** in `MEMORY.MD §5` if human input is
   required to unblock resolution (following the existing `needs_review` protocol
   from ADR-001).

#### 2.3 Timing

The MEMORY.MD update is the **last** action of any `TD-` task session, performed
after all implementation work and tests have passed but before the status is set to
`ready_for_merge`. This ensures the persistent memory is accurate at the point of
handoff.

---

### 3. Relationship to the Technical Debt Table

The `## 3. Known Technical Debt` table in `.kntic/MEMORY.MD` is the **authoritative
source of truth** for all open technical debts. The table must be kept accurate:

| Action                        | Who           | When                                        |
|-------------------------------|---------------|---------------------------------------------|
| Add a new TD entry            | Any agent     | When a new debt is identified during a task |
| Strike through a resolved TD  | TD- task agent | When the resolution is complete             |
| Annotate a partially-resolved TD | TD- task agent | When blocked or partially done           |
| Add a new TD- manifest        | Human / Agent | When a resolved debt needs formal tracking  |

New technical debt items discovered **during** a `TD-` task must be added to the
table immediately (in the same session), even if they are not related to the current
task. This prevents debts from being lost between sessions.

---

### 4. Relationship to Other ADRs

| ADR     | Relationship                                                                    |
|---------|---------------------------------------------------------------------------------|
| ADR-001 | TD- tasks follow the same manifest state machine. No special status values.     |
| ADR-003 | TD- manifests conform to the standard task schema. No special fields required.  |
| ADR-005 | This ADR — defines the TD- naming convention and MEMORY.MD update obligation.   |

TD- tasks do **not** require any special fields in the manifest JSON beyond what
ADR-003 already defines. The `description` field should reference the corresponding
MEMORY.MD debt ID for traceability.

---

### 5. Rationale

Without a formal convention:
- Agents may resolve technical debt without updating MEMORY.MD, leaving stale open
  entries that mislead future agents about the actual state of the codebase.
- Agents may defer updating MEMORY.MD "until later", which in practice means never
  — because future sessions start by reading MEMORY.MD and will not know the debt
  was resolved.
- There is no guarantee a human reviewer can determine from the manifest alone
  whether a debt was fully resolved, partially resolved, or abandoned.

By making the MEMORY.MD update **mandatory and unconditional**, this ADR ensures
that the persistent working memory remains the accurate, trustworthy foundation it
is designed to be.

---

## Consequences

- **Agents must read this ADR** at the start of any `TD-` task (it should be listed
  in the manifest's `context_scope.read_only`).
- **MEMORY.MD §3 is always accurate** — a struck-through entry means resolved; an
  un-struck entry means the debt is still open.
- **Future agents** starting a new session will never encounter a false-positive open
  debt for work that was already resolved in a prior `TD-` task.
- **Human reviewers** can determine at a glance from MEMORY.MD whether a debt has
  been actioned without reading the full manifest history.
