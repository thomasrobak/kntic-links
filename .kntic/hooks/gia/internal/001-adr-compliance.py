#!/usr/bin/env python3
"""
Hook: 001-adr-compliance.py (internal)
Programmatic ADR compliance validation (ADR-001 through ADR-007).

Checks:
  ADR-001: All manifests use valid FSM statuses.
  ADR-002: If kntic.yml is in the change set, verify dashboard volume mounts
           use :ro unless explicitly justified in ADR-002 §2.
  ADR-003: All manifests have required fields; no null/""/[] omission-rule violations.
  ADR-004: If .kntic/gia/state.json exists, verify it conforms to the documented schema.
  ADR-005: If any TD- prefixed manifest is in the change set, verify MEMORY.MD §3 entry.
  ADR-006: If any ADR file in .kntic/adrs/ is in the change set, verify mandatory sections.
  ADR-007: If any PROPOSAL-*.md file in .kntic/docs/ is in the change set, verify
           mandatory sections, filename format, and valid status values.

Exit code 0 = all checks pass, non-zero = at least one check failed.
"""

import json
import os
import re
import subprocess
import sys

ERRORS = 0
MANIFESTS_DIR = os.path.join(".kntic", "manifests")
ADRS_DIR = os.path.join(".kntic", "adrs")
MEMORY_PATH = os.path.join(".kntic", "MEMORY.MD")
GIA_STATE_PATH = os.path.join(".kntic", "gia", "state.json")
KNTIC_YML_PATH = "kntic.yml"

# ADR-001 valid statuses
VALID_STATUSES = {
    "todo", "in_progress", "refactoring", "needs_review",
    "ready_for_merge", "merged", "backlog",
}

# ADR-003 required fields
REQUIRED_FIELDS = {"task_id", "title", "status"}

# ADR-003 valid priority values
VALID_PRIORITIES = {"high", "medium", "low"}

# ADR-004 valid GIA status values
VALID_GIA_STATUSES = {"pass", "fail"}

# ADR-004 fields that must always be present after a write (§3.1)
GIA_REQUIRED_FIELDS = {"status", "last_checked"}

# ADR-004 scoring fields added by GIA-001 — validated if present
GIA_SCORING_FIELDS = {"alignment_score", "dimensions", "change_delta", "merge_threshold"}

# ADR-006 mandatory sections (regex patterns for headings)
ADR_MANDATORY_SECTIONS = [
    (r"^#\s+ADR\s+\d+:", "Title (# ADR NNN: ...)"),
    (r"^##\s+Status", "Status"),
    (r"^##\s+Context", "Context"),
    (r"^##\s+Decision", "Decision"),
    (r"^##\s+Consequences", "Consequences"),
]

# ADR-007 mandatory sections for proposals (regex patterns for headings)
PROPOSAL_MANDATORY_SECTIONS = [
    (r"^#\s+PROPOSAL[-\s]\d+:", "Title (# PROPOSAL NNN: ...)"),
    (r"^##\s+Status", "Status"),
    (r"^##\s+Author", "Author"),
    (r"^##\s+Context", "Context"),
    (r"^##\s+Proposal\b", "Proposal"),
    (r"^##\s+Alternatives\s+Considered", "Alternatives Considered"),
    (r"^##\s+Impact", "Impact"),
    (r"^##\s+Open\s+Questions", "Open Questions"),
    (r"^##\s+Manifest\s+File", "Manifest File"),
]

# ADR-007 valid proposal status values
VALID_PROPOSAL_STATUSES = {"Draft", "Proposed", "Accepted", "Rejected", "Deferred"}

# ADR-002 dashboard mounts that are justified for write access
DASHBOARD_WRITE_JUSTIFIED = {
    "/app/.kntic/manifests",  # INIT-003: Manifest CRUD from dashboard UI
    "/app/.kntic/docs",       # DASHBOARD-003: Proposal acceptance writes acceptance markers (ADR-007)
}


def fail(msg):
    global ERRORS
    print(f"  ✗ {msg}", file=sys.stderr)
    ERRORS += 1


def ok(msg):
    print(f"  ✓ {msg}")


def get_changed_files(base_branch="main"):
    """Return the list of files changed relative to the base branch."""
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", base_branch],
            capture_output=True, text=True,
        )
        return [f for f in result.stdout.strip().split("\n") if f]
    except Exception:
        return []


# ── ADR-001: Manifest Status Validation ──────────────────────────────────────
def check_adr_001():
    """All manifests in .kntic/manifests/ must use valid FSM statuses."""
    print("\n[003] ADR-001: Checking manifest statuses...")
    if not os.path.isdir(MANIFESTS_DIR):
        fail(f"Manifests directory not found: {MANIFESTS_DIR}")
        return

    prev_errors = ERRORS
    for filename in sorted(os.listdir(MANIFESTS_DIR)):
        if not filename.endswith(".json"):
            continue
        filepath = os.path.join(MANIFESTS_DIR, filename)
        try:
            with open(filepath, "r") as f:
                manifest = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            fail(f"{filename}: Cannot parse JSON — {e}")
            continue

        status = manifest.get("status")
        if status not in VALID_STATUSES:
            fail(f"{filename}: Invalid status '{status}' — valid: {sorted(VALID_STATUSES)}")

    if ERRORS == prev_errors:
        ok("All manifests have valid ADR-001 statuses")


# ── ADR-002: Volume Mount :ro Enforcement ────────────────────────────────────
def check_adr_002(changed_files):
    """If kntic.yml is in the change set, verify dashboard :ro enforcement."""
    print("\n[003] ADR-002: Checking dashboard volume mount :ro enforcement...")
    if KNTIC_YML_PATH not in changed_files:
        ok("kntic.yml not in change set — skipping ADR-002 mount check")
        return

    if not os.path.isfile(KNTIC_YML_PATH):
        fail(f"{KNTIC_YML_PATH} not found")
        return

    prev_errors = ERRORS
    try:
        with open(KNTIC_YML_PATH, "r") as f:
            content = f.read()
    except OSError as e:
        fail(f"Cannot read {KNTIC_YML_PATH}: {e}")
        return

    # Extract the dashboard service block (between "dashboard:" and "orchestrator:")
    dashboard_match = re.search(
        r"^\s+dashboard:.*?(?=^\s+orchestrator:|\Z)",
        content,
        re.MULTILINE | re.DOTALL,
    )
    if not dashboard_match:
        fail("Cannot find dashboard service block in kntic.yml")
        return

    dashboard_block = dashboard_match.group()

    # Find volume mount lines: "- <host>:<container>[:ro]"
    # Extract the container-side path and optional :ro suffix
    volume_lines = re.findall(r"-\s+\S+:(/\S+)", dashboard_block)

    for vol_spec in volume_lines:
        # vol_spec looks like "/app/.kntic/gia:ro" or "/app/.kntic/manifests"
        parts = vol_spec.split(":")
        container_path = parts[0]
        has_ro = len(parts) > 1 and parts[1] == "ro"

        if not has_ro and container_path not in DASHBOARD_WRITE_JUSTIFIED:
            fail(
                f"Dashboard volume '{container_path}' is not :ro and not in "
                f"the ADR-002 write-justified list. Add :ro or document the "
                f"write justification in ADR-002 §2."
            )

    if ERRORS == prev_errors:
        ok("All dashboard volume mounts comply with ADR-002 :ro policy")


# ── ADR-003: Schema & Omission Rule ─────────────────────────────────────────
def check_adr_003():
    """All manifests must conform to schema; no null/""/[] omission-rule violations."""
    print("\n[003] ADR-003: Checking manifest schema and omission rule...")
    if not os.path.isdir(MANIFESTS_DIR):
        fail(f"Manifests directory not found: {MANIFESTS_DIR}")
        return

    prev_errors = ERRORS
    for filename in sorted(os.listdir(MANIFESTS_DIR)):
        if not filename.endswith(".json"):
            continue
        filepath = os.path.join(MANIFESTS_DIR, filename)
        try:
            with open(filepath, "r") as f:
                manifest = json.load(f)
        except (json.JSONDecodeError, OSError):
            # Already caught in ADR-001 check
            continue

        # Required fields
        for field in REQUIRED_FIELDS:
            if field not in manifest:
                fail(f"{filename}: Missing required field '{field}'")

        # Omission rule: no null, "", or [] values
        for key, value in manifest.items():
            if value is None:
                fail(f"{filename}: Field '{key}' is null — omit it instead (ADR-003 omission rule)")
            elif isinstance(value, str) and value == "" and key not in ("summary",):
                fail(f"{filename}: Field '{key}' is empty string — omit it instead (ADR-003 omission rule)")
            elif isinstance(value, list) and len(value) == 0:
                fail(f"{filename}: Field '{key}' is empty array — omit it instead (ADR-003 omission rule)")

        # Validate status is a string
        if "status" in manifest and not isinstance(manifest["status"], str):
            fail(f"{filename}: 'status' must be a string, got {type(manifest['status']).__name__}")

        # Validate priority if present
        if "priority" in manifest and manifest["priority"] not in VALID_PRIORITIES:
            fail(f"{filename}: Invalid priority '{manifest['priority']}' — valid: {sorted(VALID_PRIORITIES)}")

        # Validate depends_on if present
        if "depends_on" in manifest:
            deps = manifest["depends_on"]
            if not isinstance(deps, list):
                fail(f"{filename}: 'depends_on' must be an array")
            elif len(deps) == 0:
                fail(f"{filename}: 'depends_on' is empty array — omit it instead (ADR-003 omission rule)")
            else:
                for dep in deps:
                    if not isinstance(dep, str):
                        fail(f"{filename}: 'depends_on' entries must be strings, got {type(dep).__name__}")

        # Validate gia_failure if present (ADR-003 §gia_failure)
        if "gia_failure" in manifest:
            gf = manifest["gia_failure"]
            if not isinstance(gf, dict):
                fail(f"{filename}: 'gia_failure' must be an object")
            elif len(gf) == 0:
                fail(f"{filename}: 'gia_failure' is empty object — omit it instead (ADR-003 omission rule)")
            else:
                # Required sub-fields
                if "reason" not in gf or not isinstance(gf.get("reason"), str):
                    fail(f"{filename}: gia_failure.reason must be a non-empty string")
                if "alignment_score" not in gf:
                    fail(f"{filename}: gia_failure missing required 'alignment_score'")
                elif not isinstance(gf["alignment_score"], (int, float)):
                    fail(f"{filename}: gia_failure.alignment_score must be a number")
                elif not (0.0 <= gf["alignment_score"] <= 1.0):
                    fail(f"{filename}: gia_failure.alignment_score {gf['alignment_score']} outside [0.0, 1.0]")
                if "dimensions" not in gf:
                    fail(f"{filename}: gia_failure missing required 'dimensions'")
                elif not isinstance(gf["dimensions"], dict):
                    fail(f"{filename}: gia_failure.dimensions must be an object")
                # logs is optional but must be a string if present
                if "logs" in gf and not isinstance(gf["logs"], str):
                    fail(f"{filename}: gia_failure.logs must be a string")

        # Validate actions if present
        if "actions" in manifest:
            actions = manifest["actions"]
            if not isinstance(actions, list):
                fail(f"{filename}: 'actions' must be an array")
            else:
                for i, action in enumerate(actions):
                    if not isinstance(action, dict):
                        fail(f"{filename}: actions[{i}] must be an object")
                        continue
                    if "timestamp" not in action:
                        fail(f"{filename}: actions[{i}] missing required 'timestamp'")
                    if "status" not in action:
                        fail(f"{filename}: actions[{i}] missing required 'status'")

    if ERRORS == prev_errors:
        ok("All manifests comply with ADR-003 schema and omission rule")


# ── ADR-004: GIA State File Schema ──────────────────────────────────────────
def check_adr_004():
    """If .kntic/gia/state.json exists, verify it conforms to documented schema."""
    print("\n[003] ADR-004: Checking GIA state file schema...")
    if not os.path.isfile(GIA_STATE_PATH):
        print("  ⚠ state.json not found — skipping (GIA has not run yet)")
        return

    prev_errors = ERRORS
    try:
        with open(GIA_STATE_PATH, "r") as f:
            state = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        fail(f"Cannot parse {GIA_STATE_PATH}: {e}")
        return

    if not isinstance(state, dict):
        fail(f"{GIA_STATE_PATH}: Root must be a JSON object")
        return

    # Check required fields (always present per ADR-004 §3.1)
    for field in GIA_REQUIRED_FIELDS:
        if field not in state:
            fail(f"{GIA_STATE_PATH}: Missing required field '{field}'")

    # Validate status value
    status = state.get("status")
    if status is not None and status not in VALID_GIA_STATUSES:
        fail(f"{GIA_STATE_PATH}: Invalid status '{status}' — valid: {sorted(VALID_GIA_STATUSES)}")

    # Validate scoring fields (GIA-001) — only check if present
    score = state.get("alignment_score")
    if score is not None:
        if not isinstance(score, (int, float)):
            fail(f"{GIA_STATE_PATH}: 'alignment_score' must be a number")
        elif not (0.0 <= score <= 1.0):
            fail(f"{GIA_STATE_PATH}: 'alignment_score' {score} outside valid range [0.0, 1.0]")

    dims = state.get("dimensions")
    if dims is not None:
        if not isinstance(dims, dict):
            fail(f"{GIA_STATE_PATH}: 'dimensions' must be an object")
        else:
            expected_dims = {"bootstrap_integrity", "hook_results",
                             "schema_compliance", "security_isolation"}
            for dim_name in expected_dims:
                if dim_name not in dims:
                    fail(f"{GIA_STATE_PATH}: Missing dimension '{dim_name}'")
                elif isinstance(dims[dim_name], dict):
                    for sub_key in ("score", "weight", "weighted"):
                        if sub_key not in dims[dim_name]:
                            fail(f"{GIA_STATE_PATH}: dimensions.{dim_name} missing '{sub_key}'")

    # Validate conditional fields based on status
    if status == "pass" and "files_validated" not in state:
        fail(f"{GIA_STATE_PATH}: status='pass' but 'files_validated' is missing")
    if status == "fail" and "reason" not in state:
        fail(f"{GIA_STATE_PATH}: status='fail' but 'reason' is missing")

    if ERRORS == prev_errors:
        ok("GIA state file conforms to ADR-004 schema")


# ── ADR-005: TD- Naming Convention & MEMORY.MD Entry ────────────────────────
def check_adr_005(changed_files):
    """If any TD- manifest is in the change set, verify MEMORY.MD §3 entry exists."""
    print("\n[003] ADR-005: Checking TD- manifest naming and MEMORY.MD entries...")

    # Filter changed files for TD- manifests
    td_manifests_in_changeset = [
        f for f in changed_files
        if f.startswith(".kntic/manifests/TD-") and f.endswith(".json")
    ]

    if not td_manifests_in_changeset:
        ok("No TD- manifests in change set — skipping ADR-005 check")
        return

    prev_errors = ERRORS

    # Read MEMORY.MD to find TD references in §3
    memory_content = ""
    if os.path.isfile(MEMORY_PATH):
        try:
            with open(MEMORY_PATH, "r") as f:
                memory_content = f.read()
        except OSError:
            pass

    # Extract all TD-N references from §3 (Known Technical Debt section)
    td_in_memory = set()
    in_debt_section = False
    for line in memory_content.splitlines():
        if re.match(r"^##\s+3\.\s+Known Technical Debt", line):
            in_debt_section = True
            continue
        if in_debt_section and re.match(r"^##\s+\d+\.", line):
            break
        if in_debt_section:
            for m in re.finditer(r"~{0,2}TD-(\d+)~{0,2}", line):
                td_in_memory.add(int(m.group(1)))

    for filepath in td_manifests_in_changeset:
        filename = os.path.basename(filepath)
        td_match = re.match(r"^TD-(\d+)\.json$", filename)
        if not td_match:
            continue

        td_num = int(td_match.group(1))
        if td_num not in td_in_memory:
            fail(
                f"{filename}: TD-{td_num} manifest exists but no corresponding "
                f"TD-{td_num} entry found in MEMORY.MD §3 (Known Technical Debt)"
            )

    if ERRORS == prev_errors:
        ok("All TD- manifests in change set have corresponding MEMORY.MD §3 entries")


# ── ADR-006: ADR Structure Standard ─────────────────────────────────────────
def check_adr_006(changed_files):
    """If any ADR file is in the change set, verify mandatory sections."""
    print("\n[003] ADR-006: Checking ADR structure compliance...")

    # Filter changed files for ADRs
    adrs_in_changeset = [
        f for f in changed_files
        if f.startswith(".kntic/adrs/") and f.endswith(".md")
    ]

    if not adrs_in_changeset:
        ok("No ADR files in change set — skipping ADR-006 check")
        return

    prev_errors = ERRORS
    for filepath in adrs_in_changeset:
        filename = os.path.basename(filepath)
        full_path = filepath if os.path.isfile(filepath) else os.path.join(".", filepath)
        if not os.path.isfile(full_path):
            # File was deleted in the change set — skip
            continue

        try:
            with open(full_path, "r") as f:
                content = f.read()
        except OSError as e:
            fail(f"{filename}: Cannot read — {e}")
            continue

        # Check each mandatory section
        for pattern, section_name in ADR_MANDATORY_SECTIONS:
            if not re.search(pattern, content, re.MULTILINE):
                fail(f"{filename}: Missing mandatory section '{section_name}' (ADR-006)")

        # Validate filename format: ADR-NNN-Descriptive-Title.md
        if not re.match(r"^ADR-\d{3}-[A-Za-z0-9][\w-]*\.md$", filename):
            fail(
                f"{filename}: Filename does not match ADR-006 naming convention "
                f"'ADR-NNN-Descriptive-Title.md'"
            )

    if ERRORS == prev_errors:
        ok("All ADR files in change set comply with ADR-006 structure standard")


# ── ADR-007: Proposal Format & Handling ──────────────────────────────────────
def check_adr_007(changed_files):
    """If any PROPOSAL file in .kntic/docs/ is in the change set, verify mandatory sections."""
    print("\n[003] ADR-007: Checking proposal format compliance...")

    # Filter changed files for proposals
    proposals_in_changeset = [
        f for f in changed_files
        if (f.startswith(".kntic/docs/") and
            os.path.basename(f).upper().startswith("PROPOSAL-") and
            f.lower().endswith(".md"))
    ]

    if not proposals_in_changeset:
        ok("No proposal files in change set — skipping ADR-007 check")
        return

    prev_errors = ERRORS
    for filepath in proposals_in_changeset:
        filename = os.path.basename(filepath)
        full_path = filepath if os.path.isfile(filepath) else os.path.join(".", filepath)
        if not os.path.isfile(full_path):
            # File was deleted in the change set — skip
            continue

        try:
            with open(full_path, "r") as f:
                content = f.read()
        except OSError as e:
            fail(f"{filename}: Cannot read — {e}")
            continue

        # Check each mandatory section
        for pattern, section_name in PROPOSAL_MANDATORY_SECTIONS:
            if not re.search(pattern, content, re.MULTILINE):
                fail(f"{filename}: Missing mandatory section '{section_name}' (ADR-007)")

        # Validate status value
        status_match = re.search(r"^##\s+Status:\s*(\S+)", content, re.MULTILINE)
        if status_match:
            status_val = status_match.group(1)
            if status_val not in VALID_PROPOSAL_STATUSES:
                fail(
                    f"{filename}: Invalid proposal status '{status_val}' — "
                    f"valid: {sorted(VALID_PROPOSAL_STATUSES)} (ADR-007)"
                )

    if ERRORS == prev_errors:
        ok("All proposal files in change set comply with ADR-007 format standard")


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    print("[hook:001-adr-compliance] Running ADR compliance checks...")

    changed_files = get_changed_files()
    if changed_files:
        print(f"  ({len(changed_files)} file(s) changed relative to main)")

    check_adr_001()
    check_adr_002(changed_files)
    check_adr_003()
    check_adr_004()
    check_adr_005(changed_files)
    check_adr_006(changed_files)
    check_adr_007(changed_files)

    print()
    if ERRORS > 0:
        print(f"[hook:001-adr-compliance] FAILED — {ERRORS} compliance issue(s) found.")
        sys.exit(1)
    else:
        print("[hook:001-adr-compliance] PASSED — all ADR compliance checks passed.")
        sys.exit(0)


if __name__ == "__main__":
    main()
