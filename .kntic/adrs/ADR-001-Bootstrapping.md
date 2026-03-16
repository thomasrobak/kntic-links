# ADR 001: Manifest-Driven Orchestration

## Status: Accepted
## Context: 
We require a high-velocity, autonomous development engine that minimizes human intervention while maintaining safety and architectural integrity.

## Decision:
We will use a JSON-based manifest system located in `.kntic/manifests/`. 
The engine will operate as a finite state machine (FSM) with the following states:

1. **todo**: Task is defined and ready for pickup.
2. **in_progress**: An agent is currently executing the task.
3. **refactoring**: Task failed validation; agent must fix issues. The Orchestrator writes GIA failure context (reason, alignment score, dimension breakdown, and hook logs) back into the manifest's `notes`, `actions`, and `gia_failure` fields so the agent can target fixes precisely (see ADR-003 `gia_failure` sub-schema).
4. **needs_review**: Agent has hit an ambiguity or requires human authorization.
5. **ready_for_merge**: Agent has finished; task is ready for GIA (Global Impact Analysis).
6. **merged**: GIA passed; the Orchestrator sets this status immediately after the GIA PASSED confirmation, before the commit/push. Changes are committed and pushed to the repository as the next step, but the `merged` status is not contingent on push success — it reflects that GIA validation has succeeded.
7. **backlog**: Tasks that have to be refined by the human before being manually switched to todo

## Rules of Engagement:
- **State Enforcement**: Agents MUST NOT use statuses outside this list (e.g., "done").
- **Working Memory**: Agents MUST read and update `.kntic/MEMORY.MD` at the start and end of every session to maintain long-term context.
- **Safety**: If a task requires a "breaking change" or high-risk security adjustment, the Agent MUST set the status to `needs_review` and document the reasoning in `.kntic/MEMORY.MD`.

## Consequences:
- Provides a clear handoff between autonomous execution and human oversight.
- Prevents infinite loops when the agent encounters an unresolvable error.
