# ADR 006: Architecture Decision Record Guidelines

## Status: Accepted

## Context

As the KNTIC Pulse platform matured, five ADRs were created across different tasks
and sessions. While all share a broadly similar Markdown structure, the level of detail
and internal organisation varies significantly — from ADR-002's two-line summary to
ADR-004's multi-section contract specification.

Without a documented standard for ADR structure, future agents and contributors face
ambiguity about what an ADR must contain, how deeply it should specify its decision,
and what cross-references it should carry. This inconsistency risks:

- New ADRs omitting critical sections (e.g. consequences, context).
- Existing ADRs remaining sparse while the actual rules live only in `MEMORY.MD`.
- Reviewers being unable to assess ADR completeness against a known standard.

This ADR codifies the **mandatory structure and content expectations** for all
Architecture Decision Records in `.kntic/adrs/`.

---

## Decision

### 1. File Location & Naming

All ADRs must be stored in `.kntic/adrs/` — the sole canonical location (confirmed
by REGEN-002; the legacy `docs/adr/` directory has been removed).

**Filename format:**
```
ADR-{NNN}-{Descriptive-Title}.md
```

- `{NNN}` — zero-padded three-digit sequence number (e.g. `001`, `012`).
- `{Descriptive-Title}` — hyphen-separated title matching the document's `# ADR NNN:` heading.
- Example: `ADR-006-ADR-Guidelines.md`

ADR numbers are **never reused**. A superseded ADR retains its number and receives a
`Superseded by ADR-NNN` status update.

---

### 2. Mandatory Sections

Every ADR **must** contain the following top-level sections in this order:

| Section          | Heading                 | Purpose                                                                                         |
|------------------|-------------------------|-------------------------------------------------------------------------------------------------|
| Title            | `# ADR NNN: Title`      | Single-line document heading with the ADR number and descriptive title.                        |
| Status           | `## Status: {value}`    | Current lifecycle state (see §3).                                                               |
| Context          | `## Context`            | Explains **why** the decision is needed — the problem, the trigger, and the stakes if unaddressed. |
| Decision         | `## Decision`           | The decision itself, with enough detail that an agent or contributor can implement and verify compliance without consulting external sources. |
| Consequences     | `## Consequences`       | What follows from adopting the decision — both benefits and obligations. Must be actionable: who must do what differently as a result. |

**Optional sections** may be added between Decision and Consequences when the
decision is complex enough to warrant them (e.g. schema tables, architecture
diagrams, canonical examples). These should use `### ` sub-headings within the
`## Decision` section.

---

### 3. Status Values

| Value                    | Meaning                                                         |
|--------------------------|-----------------------------------------------------------------|
| `Accepted`               | Decision is in effect and must be followed.                    |
| `Proposed`               | Decision is under discussion; not yet binding.                 |
| `Superseded by ADR-NNN`  | Decision has been replaced by a newer ADR. The superseding ADR must reference the old one. |
| `Deprecated`             | Decision is no longer relevant but was never formally replaced. |

New ADRs created by agents should use `Accepted` unless the task manifest
explicitly requests a `Proposed` status for human review.

---

### 4. Content Standards

#### 4.1 Context Section

The Context section must:
- State the **problem or gap** that triggered the ADR.
- Reference the **task(s)** or **session(s)** where the issue was identified.
- Explain the **risk** of not having the decision documented.

It must **not** contain the decision itself — that belongs in the Decision section.

#### 4.2 Decision Section

The Decision section must:
- Be **specific and implementable** — an agent reading only this section should be
  able to determine whether a given file, configuration, or code pattern is compliant.
- Use **sub-sections** (`### `) for distinct aspects of the decision when it covers
  multiple concerns (e.g. schema definition, write semantics, volume mounts).
- Include **canonical examples** (code blocks, JSON samples, diagrams) where the
  decision involves a concrete format or pattern.
- Reference **other ADRs** by number when the decision depends on or constrains them.

#### 4.3 Consequences Section

The Consequences section must:
- State **who is affected** (agents, humans, dashboard, orchestrator).
- List **obligations** created by the decision (e.g. "agents must read this ADR
  before creating a new hook").
- Note any **trade-offs** or limitations accepted as part of the decision.

---

### 5. Cross-Reference Obligations

When a new ADR is created or an existing ADR is substantially modified:

1. **MEMORY.MD §2.7** — the ADR table in the `.kntic/` Pluggable Architecture section
   must be updated to include the new or modified ADR (file, title, key rule).
2. **Related ADRs** — if the new ADR constrains, extends, or supersedes another ADR,
   add a cross-reference in the Decision or Consequences section.
3. **Manifest `context_scope`** — tasks that create or modify ADRs should list
   `.kntic/adrs/` in their `write_access`.

---

### 6. Modification Rules

- **Append-friendly:** Minor clarifications, typo fixes, and additional examples may
  be added to an `Accepted` ADR without changing its status.
- **Substantive changes:** If the core decision changes, a new ADR should be created
  that supersedes the original. The original ADR's status is updated to
  `Superseded by ADR-NNN`.
- **Immutable history:** ADR numbers and creation context must never be altered.
  The Context section is a historical record of why the decision was made.

---

## Consequences

- **All existing ADRs** should conform to this structure. ADRs that predate this
  guideline and lack mandatory sections should be reformatted when next modified
  (or as a dedicated cleanup task).
- **Agents creating new ADRs** must follow this template. Non-conforming ADRs will
  be flagged during review.
- **MEMORY.MD** remains the operational summary; ADRs are the normative source.
  If MEMORY.MD and an ADR conflict, the ADR takes precedence.
- **Consistency:** All ADRs in `.kntic/adrs/` will share a predictable structure,
  making them navigable by both humans and agents without per-document discovery.
