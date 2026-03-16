# ADR 007: Proposal Format and Handling

## Status: Accepted

## Context

As KNTIC matures, architectural decisions increasingly benefit from a structured
discussion phase before they become binding ADRs. Currently, ideas and design
proposals are communicated informally through task descriptions, MEMORY.MD notes,
or inline code comments. This has several drawbacks:

- **No audit trail** — proposals that are rejected or deferred leave no record
  of the reasoning, leading to repeated discussions.
- **No standard location** — contributors cannot discover existing proposals
  without searching across manifests, memory files, and chat logs.
- **No lifecycle** — there is no formal way to track whether a proposal has been
  accepted (becoming an ADR), rejected, or is still under discussion.

ADR-006 standardised the format of *accepted* decisions but does not cover the
pre-decision phase. This ADR fills that gap by defining a lightweight Proposal
document standard that feeds into the ADR pipeline.

---

## Decision

### 1. File Location & Naming

All proposals must be stored in `.kntic/docs/` with the following filename format:

```
PROPOSAL-{NNN}-{Descriptive-Title}.md
```

- `{NNN}` — zero-padded three-digit sequence number, globally unique and never
  reused. Numbering is independent of ADR numbers.
- `{Descriptive-Title}` — hyphen-separated short title.
- Example: `PROPOSAL-001-Extendable-GIA-Weight-Configuration.md`

### 2. Mandatory Sections

Every proposal **must** contain the following sections in order:

| Section        | Heading                     | Purpose                                                                                      |
|----------------|-----------------------------|----------------------------------------------------------------------------------------------|
| Title          | `# PROPOSAL NNN: Title`     | Single-line heading with the proposal number and descriptive title.                          |
| Status         | `## Status: {value}`        | Current lifecycle state (see §3).                                                            |
| Author         | `## Author`                 | Who authored the proposal (agent ID, task ID, or human name).                                |
| Context        | `## Context`                | The problem or opportunity that motivates the proposal. Must not contain the solution itself. |
| Proposal       | `## Proposal`               | The proposed solution, with enough detail for evaluation. Sub-sections (`### `) encouraged.   |
| Alternatives   | `## Alternatives Considered`| At least one alternative approach with trade-offs. May include "do nothing".                  |
| Impact         | `## Impact`                 | What changes if the proposal is accepted — affected files, ADRs, workflows.                  |
| Open Questions | `## Open Questions`         | Unresolved issues that need human or team input before acceptance.                           |

### 3. Status Values

| Value       | Meaning                                                                          |
|-------------|----------------------------------------------------------------------------------|
| `Draft`     | Proposal is being written; not yet ready for review.                             |
| `Proposed`  | Ready for review and discussion.                                                 |
| `Accepted`  | Approved — a corresponding ADR should be created to formalise the decision.      |
| `Rejected`  | Reviewed and declined. The document remains as a record of the reasoning.        |
| `Deferred`  | Valid idea but not a priority now. May be revisited later.                        |

### 4. Lifecycle

1. **Creation** — An agent or human creates a `PROPOSAL-NNN-*.md` file in `.kntic/docs/`
   with status `Draft` or `Proposed`.
2. **Review** — Humans (or designated reviewer agents) evaluate the proposal. Discussion
   is captured by updating the `## Open Questions` section.
3. **Decision** — The proposal status is updated to `Accepted`, `Rejected`, or `Deferred`.
4. **ADR Creation** — If accepted, a new ADR is created in `.kntic/adrs/` that references
   the proposal: *"Based on PROPOSAL-NNN"*. The proposal status stays `Accepted` and
   gains a cross-reference: *"Formalised in ADR-NNN"*.
5. **Archival** — Rejected and deferred proposals remain in `.kntic/docs/` indefinitely.
   They are never deleted — they serve as a record of considered alternatives.

### 5. Cross-Reference Obligations

- When a proposal is **accepted**, the resulting ADR must reference the proposal number.
- When a proposal **references existing ADRs** it must cite them by number (e.g. "see ADR-004").
- MEMORY.MD does **not** need to track every proposal — only accepted ones that result
  in architectural changes.

### 6. Relationship to ADRs

Proposals are **pre-decisional**; ADRs are **post-decisional**. A proposal explores
options; an ADR records the chosen option and its consequences. Not every proposal
becomes an ADR — rejected proposals are equally valuable as documented reasoning.

---

### 7. Manifest Section Requirement

Every proposal **must** include a `## Manifest File` section at the end of the document
(before the trace-back line). This section contains:

1. A short instruction: *"When this proposal is approved, create the following manifest:"*
2. The **file path** of the proposed manifest.
3. A **fenced JSON code block** with the complete manifest content, ready for copy-paste
   creation. The manifest must conform to ADR-003.
4. The manifest `status` in the proposal must be `"backlog"` — it is promoted to `"todo"`
   only upon acceptance.

> ⚠️ The manifest file is **not** created when the proposal is written. It is created
> only when the proposal status changes to `Accepted` (either manually by a human or
> via the dashboard acceptance flow from DASHBOARD-003).

This ensures every proposal is actionable: acceptance produces a ready-to-execute task
with no ambiguity about scope, priority, or task ID.

---

## Proposal Registry

The following proposals exist in `.kntic/docs/`. This table is maintained as a living
reference and must be updated whenever a proposal is created, accepted, or rejected.

| Proposal | Title | Status | Resulting Task |
|----------|-------|--------|----------------|
| PROPOSAL-001 | Continuous GIA Alignment Score | Accepted | GIA-001 |
| PROPOSAL-002 | Dashboard API Authentication | Accepted | SEC-001 |
| PROPOSAL-003 | Narrow Orchestrator Volume Mounts | Draft | SEC-002 (proposed) |
| PROPOSAL-004 | Task Dependency Graph | Accepted | ORCH-001 |
| PROPOSAL-005 | Programmatic ADR Compliance Hooks | Accepted | GIA-002 |
| PROPOSAL-006 | Multi-Branch Orchestration Strategy | Proposed | ORCH-003 (proposed) |
| PROPOSAL-007 | GIA Alignment Score History and Trend Dashboard | Proposed | GIA-005 (proposed) |
| PROPOSAL-008 | Agent Scope Enforcement at Runtime | Proposed | SEC-003 (proposed) |
| PROPOSAL-009 | Manifest Schema Validation Hook | Proposed | GIA-006 (proposed) |
| PROPOSAL-010 | Agent Session Timeout and Recovery | Proposed | ORCH-004 (proposed) |
| PROPOSAL-011 | REGEN Auto-Detection via GIA Drift Analysis | Proposed | REGEN-006 (proposed) |
| PROPOSAL-012 | GIA Failure Feedback Written Back to Manifest | Proposed | ORCH-002 (proposed) |

---

## Consequences

- **`.kntic/docs/`** becomes the canonical location for both proposals and other
  project documentation (e.g. WHITEPAPER.MD).
- **Agents** creating proposals must follow this template. Non-conforming proposals
  will be flagged during review.
- **Rejected proposals** provide a searchable record of why certain approaches were
  not taken, reducing repeated discussions.
- **The ADR pipeline gains a formal input stage** — proposals serve as the structured
  intake for future ADRs, improving decision quality.
- **Every proposal carries an embedded manifest** — acceptance is a single-step action
  that produces a ready-to-execute task, eliminating the gap between decision and execution.
