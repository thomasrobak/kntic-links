import subprocess
import json
import re
import sys
import os
import importlib.util
from datetime import datetime, timezone

def log(message):
    print(f"[Validator] {message}")
    sys.stdout.flush()

# Path to the shared GIA state file read by the Dashboard.
GIA_STATE_PATH = os.path.join(".kntic", "gia", "state.json")

# Directories that contain the GIA hook scripts.
# Project-specific hooks run first; kntic-internal hooks run after.
HOOKS_DIR_SPECIFIC = os.path.join(".kntic", "hooks", "gia", "specific")
HOOKS_DIR_INTERNAL = os.path.join(".kntic", "hooks", "gia", "internal")

# Legacy flat directory (kept for backward compatibility with external projects).
HOOKS_DIR_LEGACY = os.path.join(".kntic", "hooks", "gia")

# Path to the optional weights configuration file.
WEIGHTS_PATH = os.path.join(".kntic", "gia", "weights.json")

# ── Default scoring configuration ────────────────────────────────────────────
# These defaults are used when weights.json is absent or incomplete.
# Each ADR dimension has a default weight.  The merge threshold controls
# the minimum alignment_score required for a "pass" result.

DEFAULT_WEIGHTS = {
    "bootstrap_integrity": 0.30,
    "hook_results": 0.50,
    "schema_compliance": 0.10,
    "security_isolation": 0.10,
}

DEFAULT_MERGE_THRESHOLD = 1.0


def _load_weights_config() -> dict:
    """
    Load the scoring weights and merge threshold from WEIGHTS_PATH.

    Returns a dict with two keys:
      - "weights": dict mapping dimension name → float weight
      - "merge_threshold": float (0.0–1.0)

    If the file is absent or unreadable, defaults are returned.
    Missing keys in the file are filled from DEFAULT_WEIGHTS / DEFAULT_MERGE_THRESHOLD
    (ADR-003 omission rule: absent keys use defaults).
    """
    config = {
        "weights": dict(DEFAULT_WEIGHTS),
        "merge_threshold": DEFAULT_MERGE_THRESHOLD,
    }

    if not os.path.isfile(WEIGHTS_PATH):
        return config

    try:
        with open(WEIGHTS_PATH, "r") as fh:
            raw = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        log(f"Warning: could not read weights config ({WEIGHTS_PATH}): {exc} — using defaults.")
        return config

    if not isinstance(raw, dict):
        log(f"Warning: weights config is not a JSON object — using defaults.")
        return config

    # Merge file weights over defaults (only known keys)
    if "weights" in raw and isinstance(raw["weights"], dict):
        for key in DEFAULT_WEIGHTS:
            if key in raw["weights"]:
                try:
                    config["weights"][key] = float(raw["weights"][key])
                except (TypeError, ValueError):
                    pass  # keep default

    if "merge_threshold" in raw:
        try:
            config["merge_threshold"] = float(raw["merge_threshold"])
        except (TypeError, ValueError):
            pass  # keep default

    return config


def _parse_hook_json_result(output_lines: list) -> dict | None:
    """
    Attempt to extract a structured JSON result from hook output.

    Hooks can optionally emit a JSON object on their **last non-empty** stdout
    line containing an ``"alignment_score"`` key (float 0.0–1.0) and optionally
    a ``"drift_items"`` array.  Example:

        {"alignment_score": 0.85, "drift_items": [{"type": "stale_reference", ...}]}

    If the last line is not valid JSON or does not contain the score key, returns
    None (the hook is treated as binary pass/fail, backward-compatible).
    """
    for line in reversed(output_lines):
        stripped = line.strip()
        if not stripped:
            continue
        if not stripped.startswith("{"):
            return None
        try:
            data = json.loads(stripped)
            if isinstance(data, dict) and "alignment_score" in data:
                return data
        except (json.JSONDecodeError, TypeError, ValueError):
            return None
    return None


def _parse_hook_json_score(output_lines: list) -> float | None:
    """
    Attempt to extract a structured JSON score from hook output.

    Hooks can optionally emit a JSON object on their **last non-empty** stdout
    line containing an ``"alignment_score"`` key (float 0.0–1.0).  Example:

        {"alignment_score": 0.95, "detail": "2 warnings"}

    If the last line is not valid JSON or does not contain the key, returns
    None (the hook is treated as binary pass/fail, backward-compatible).
    """
    # Walk backwards to find the last non-empty line
    for line in reversed(output_lines):
        stripped = line.strip()
        if not stripped:
            continue
        if not stripped.startswith("{"):
            return None
        try:
            data = json.loads(stripped)
            if isinstance(data, dict) and "alignment_score" in data:
                score = float(data["alignment_score"])
                return max(0.0, min(1.0, score))
        except (json.JSONDecodeError, TypeError, ValueError):
            return None
    return None


DOCS_DIR = os.path.join(".kntic", "docs")


def _next_proposal_number(docs_dir: str = None) -> int:
    """Find the next available PROPOSAL-REGEN-NNN number."""
    if docs_dir is None:
        docs_dir = DOCS_DIR
    archive_dir = os.path.join(docs_dir, "archive")
    max_num = 0
    for d in [docs_dir, archive_dir]:
        if not os.path.isdir(d):
            continue
        for name in os.listdir(d):
            match = re.match(r"PROPOSAL-REGEN-(\d{3})\.MD", name)
            if match:
                max_num = max(max_num, int(match.group(1)))
    return max_num + 1


def _generate_regen_proposal(drift_items: list, docs_dir: str = None) -> str | None:
    """
    Auto-generate a REGEN proposal document for detected drift items.

    The proposal follows ADR-007 format and is written to .kntic/docs/.
    Returns the proposal filename if written, or None on failure.
    """
    if not drift_items:
        return None

    if docs_dir is None:
        docs_dir = DOCS_DIR
    if not os.path.isdir(docs_dir):
        os.makedirs(docs_dir, exist_ok=True)

    proposal_num = _next_proposal_number(docs_dir)
    filename = f"PROPOSAL-REGEN-{proposal_num:03d}.MD"
    filepath = os.path.join(docs_dir, filename)

    # Don't overwrite existing proposals
    if os.path.exists(filepath):
        log(f"Proposal {filename} already exists — skipping generation.")
        return None

    # Group drift items by type
    by_type = {}
    for item in drift_items:
        t = item.get("type", "unknown")
        by_type.setdefault(t, []).append(item)

    # Build drift details table
    drift_table_rows = []
    for item in drift_items:
        drift_table_rows.append(
            f"| `{item.get('type', 'unknown')}` | `{item.get('file', '?')}` | "
            f"{item.get('line', 0)} | {item.get('detail', '')} |"
        )
    drift_table = "\n".join(drift_table_rows)

    # Build type summary
    type_summary = ", ".join(
        f"{len(items)} {t}" for t, items in sorted(by_type.items())
    )

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    content = f"""# PROPOSAL-REGEN-{proposal_num:03d}: Auto-detected structural drift

## Status: Draft

## Author
GIA Drift Detection (automated)

## Context

The GIA drift detection hooks identified {len(drift_items)} structural inconsistency(ies)
during a routine GIA run on {timestamp}.

Drift types detected: {type_summary}.

These inconsistencies indicate that the codebase has diverged from its documented
architecture. Per Whitepaper §4, structural drift should be addressed via REGEN tasks
to maintain alignment between documentation and implementation.

## Proposal

### Drift Items

| Type | File | Line | Detail |
|------|------|------|--------|
{drift_table}

### Recommended Actions

"""
    # Add recommendations per type
    if "stale_reference" in by_type:
        content += "- **Stale references:** Update or remove file path references that no longer exist on disk.\n"
    if "adr_memory_desync" in by_type:
        content += "- **ADR/MEMORY.MD desync:** Synchronize the ADR table in MEMORY.MD §2.7 with the actual files in `.kntic/adrs/`.\n"
    if "symlink_broken" in by_type or "symlink_missing" in by_type or "symlink_wrong_target" in by_type:
        content += "- **Symlink issues:** Repair or recreate broken/missing symlinks per MEMORY.MD §2.7.\n"
    if "td_resolution_inconsistency" in by_type:
        content += "- **TD resolution inconsistency:** Align TD status in MEMORY.MD §3 with manifest statuses.\n"
    if "missing_file" in by_type:
        content += "- **Missing files:** Recreate missing critical files.\n"

    content += f"""
## Alternatives Considered

| Alternative | Trade-off |
|---|---|
| Ignore drift | Structural inconsistencies accumulate, increasing architectural entropy. |
| Manual fix without REGEN task | No audit trail; fix may be incomplete. |

## Impact

- **Files to update:** {', '.join(sorted(set(f'`{item.get("file", "?")}`' for item in drift_items)))}
- **Risk:** Low — documentation and structural alignment only.

## Open Questions

No open questions — drift items are deterministic.

## Manifest File

When this proposal is approved, create the following manifest:

**File:** `.kntic/manifests/REGEN-AUTO-{proposal_num:03d}.json`

```json
{{
  "task_id": "REGEN-AUTO-{proposal_num:03d}",
  "title": "Fix auto-detected structural drift ({type_summary})",
  "status": "backlog",
  "created_at": "{datetime.now(timezone.utc).isoformat()}",
  "priority": "low",
  "description": "Auto-generated REGEN task to fix {len(drift_items)} drift item(s) detected by GIA hooks. See PROPOSAL-REGEN-{proposal_num:03d}.MD."
}}
```

---

*Auto-generated by GIA drift detection hooks (998-drift-stale-refs.py, 999-drift-symlinks.py).*
*Traces to: Whitepaper §4, PROPOSAL-011, ADR-004.*
"""

    try:
        with open(filepath, "w") as f:
            f.write(content)
        log(f"REGEN proposal written: {filepath}")
        return filename
    except OSError as exc:
        log(f"Warning: could not write REGEN proposal: {exc}")
        return None


def _write_gia_state(report: dict) -> None:
    """
    Persist the GIA report to the shared state file so the Dashboard can
    read the result without running its own subprocess.

    The file is written atomically (temp → rename) to prevent the Dashboard
    from reading a partial write.  The directory is created if absent.
    """
    state = dict(report)
    state["last_checked"] = datetime.now(timezone.utc).isoformat()

    state_dir = os.path.dirname(GIA_STATE_PATH)
    if state_dir and not os.path.exists(state_dir):
        os.makedirs(state_dir, exist_ok=True)

    tmp_path = GIA_STATE_PATH + ".tmp"
    try:
        with open(tmp_path, "w") as fh:
            json.dump(state, fh, indent=2)
        os.replace(tmp_path, GIA_STATE_PATH)
        log(f"GIA state written to {GIA_STATE_PATH}")
    except Exception as exc:
        log(f"Warning: could not write GIA state file: {exc}")


class KineticValidator:
    def __init__(self, base_branch="main"):
        self.base_branch = base_branch
        self.core_files = [
            ".kntic/lib/orchestrator.py",
            ".kntic/lib/agent_runner.py",
            ".kntic/lib/skills/navigation.py",
            ".kntic/lib/skills/validator.py",
        ]

    def get_changed_files(self):
        """Identifies files modified in the current agent sprint."""
        try:
            cmd = ["git", "diff", "--name-only", self.base_branch]
            result = subprocess.run(cmd, capture_output=True, text=True)
            return [f for f in result.stdout.strip().split('\n') if f]
        except Exception:
            return []

    def verify_system_integrity(self):
        """BOOTSTRAP PROTECTION: Ensures core system changes don't break the brain."""
        changed_files = self.get_changed_files()
        needs_protection_check = any(cf in self.core_files for cf in changed_files)

        if needs_protection_check:
            log("Core system change detected. Running Integrity Check...")
            try:
                # Manually import to check for syntax/logical errors
                spec = importlib.util.spec_from_file_location("orchestrator", ".kntic/lib/orchestrator.py")
                orch_module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(orch_module)
                
                # FIXED: Use 'manifest_dir' instead of 'workspace_path'
                test_dir = "./.kntic/test_env"
                if not os.path.exists(test_dir):
                    os.makedirs(test_dir)
                
                _ = orch_module.Orchestrator(manifest_dir=test_dir)
                log("Integrity Check passed.")
                return True
            except Exception as e:
                log(f"Bootstrap Protection Failed: {e}")
                return False
        return True

    def _discover_hooks_in_dir(self, directory: str) -> list:
        """
        Return a sorted list of executable hook script paths found inside
        *directory*.

        Scripts are sorted lexicographically by their basename, which gives a
        predictable execution order (e.g. 001-pytests.sh runs before 002-lint.sh).

        Only regular files that are executable are included; directories, symlinks
        to directories, and non-executable files are silently skipped.
        """
        if not os.path.isdir(directory):
            return []

        hooks = []
        for name in sorted(os.listdir(directory)):
            full_path = os.path.join(directory, name)
            if os.path.isfile(full_path) and os.access(full_path, os.X_OK):
                hooks.append(full_path)
        return hooks

    def discover_hooks(self):
        """
        Return an ordered list of executable hook script paths.

        Hook execution order:
          1. **Project-specific** hooks in ``HOOKS_DIR_SPECIFIC``
             (.kntic/hooks/gia/specific/) — sorted lexicographically.
          2. **Kntic-internal** hooks in ``HOOKS_DIR_INTERNAL``
             (.kntic/hooks/gia/internal/) — sorted lexicographically.

        Specific hooks run first so that project tests (unit tests, linting,
        etc.) are evaluated before kntic's own ADR compliance checks.  This
        lets projects fail fast on their own rules.

        If neither subdirectory exists but the legacy flat directory
        (.kntic/hooks/gia/) contains executable files directly, those are
        discovered instead (backward compatibility for external projects).
        """
        specific = self._discover_hooks_in_dir(HOOKS_DIR_SPECIFIC)
        internal = self._discover_hooks_in_dir(HOOKS_DIR_INTERNAL)

        if specific or internal:
            hooks = specific + internal
            log(
                f"Discovered {len(hooks)} hook(s): "
                f"specific={[os.path.basename(h) for h in specific]}, "
                f"internal={[os.path.basename(h) for h in internal]}"
            )
            return hooks

        # Fallback: legacy flat directory (files directly in .kntic/hooks/gia/)
        legacy = self._discover_hooks_in_dir(HOOKS_DIR_LEGACY)
        if legacy:
            log(
                f"Discovered {len(legacy)} hook(s) (legacy flat layout): "
                f"{[os.path.basename(h) for h in legacy]}"
            )
        else:
            log("No hooks found in specific/, internal/, or legacy dir — skipping hooks.")
        return legacy

    def run_hooks(self):
        """
        Execute every hook discovered by discover_hooks() in sorted order.

        Each hook is run as a subprocess with **live output streaming**: every
        line written by the hook to stdout or stderr is forwarded immediately
        to the validator log so it is visible in the engine container output
        as the hook runs — not buffered until exit.

        Stderr is merged into stdout (``stderr=STDOUT``) so interleaved output
        appears in the correct chronological order.  A separate stderr capture
        pass is no longer needed; the combined stream is also accumulated in
        memory so failure details can be included in the GIA report.

        Execution continues for remaining hooks even after a failure so that
        all failures are surfaced in a single GIA run.

        Returns a dict:
            {
                "success": bool,          # True only if ALL hooks passed
                "failed_hooks": [str],    # basenames of failed hooks
                "logs": str,              # combined stdout/stderr of failed hooks
                "hook_scores": dict,      # hook_name → float score (0.0–1.0)
            }
        """
        hooks = self.discover_hooks()

        if not hooks:
            log("No hooks to run — treating as passed.")
            return {"success": True, "failed_hooks": [], "logs": "", "hook_scores": {}}

        failed_hooks = []
        failure_logs = []
        hook_scores = {}
        all_drift_items = []

        for hook_path in hooks:
            hook_name = os.path.basename(hook_path)
            log(f"━━━ Hook [{hook_name}] starting ━━━")
            accumulated_output = []
            try:
                # stderr=STDOUT merges both streams so output is chronological.
                proc = subprocess.Popen(
                    [hook_path],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,  # line-buffered
                )
                # Stream every line live as the hook produces it.
                for line in proc.stdout:
                    stripped = line.rstrip("\n")
                    log(f"[{hook_name}] {stripped}")
                    accumulated_output.append(stripped)
                proc.wait()

                # Parse structured JSON result (score + drift_items)
                json_result = _parse_hook_json_result(accumulated_output)
                drift_items = []
                if json_result and isinstance(json_result.get("drift_items"), list):
                    drift_items = json_result["drift_items"]
                    all_drift_items.extend(drift_items)

                if proc.returncode != 0:
                    log(f"━━━ Hook [{hook_name}] FAILED (exit code {proc.returncode}) ━━━")
                    failed_hooks.append(hook_name)
                    failure_logs.append(
                        f"=== {hook_name} ===\n" + "\n".join(accumulated_output)
                    )
                    # Check for JSON score even on failure (partial credit)
                    json_score = _parse_hook_json_score(accumulated_output)
                    hook_scores[hook_name] = json_score if json_score is not None else 0.0
                else:
                    log(f"━━━ Hook [{hook_name}] passed ━━━")
                    # Check for JSON score on success
                    json_score = _parse_hook_json_score(accumulated_output)
                    hook_scores[hook_name] = json_score if json_score is not None else 1.0
            except Exception as exc:
                log(f"━━━ Hook [{hook_name}] ERROR — {exc} ━━━")
                failed_hooks.append(hook_name)
                failure_logs.append(f"=== {hook_name} ===\nException: {exc}")
                hook_scores[hook_name] = 0.0

        # Auto-generate REGEN proposal if drift items were found
        if all_drift_items:
            log(f"Drift detected: {len(all_drift_items)} item(s) — generating REGEN proposal.")
            _generate_regen_proposal(all_drift_items)

        success = len(failed_hooks) == 0
        return {
            "success": success,
            "failed_hooks": failed_hooks,
            "logs": "\n".join(failure_logs),
            "hook_scores": hook_scores,
            "drift_items": all_drift_items,
        }

    def compute_alignment_score(self, *, integrity_passed: bool,
                                 hook_results: dict,
                                 changed_files: list) -> dict:
        """
        Compute the continuous Alignment Score per Whitepaper §3.

        The formula:
            A = (Σ(C · wc) + Σ(I · wi)) / Δ

        Where:
          - C: ADR compliance sub-scores (bootstrap_integrity, schema_compliance,
               security_isolation) weighted by wc
          - I: Dependency integrity from hook results, weighted by wi
          - Δ: Change delta normalisation factor

        Δ (change delta) is defined as:
            Δ = 1  when no files changed (baseline — score is not penalised)
            Δ = 1  otherwise (the weights already encode relative importance;
                   file count scaling is reserved for future refinement)

        This means A is in the range [0.0, 1.0] when all weights sum to 1.0.

        Returns a dict:
            {
                "alignment_score": float,       # composite 0.0–1.0
                "dimensions": {                 # per-dimension breakdown
                    "bootstrap_integrity": {"score": float, "weight": float, "weighted": float},
                    "hook_results":        {"score": float, "weight": float, "weighted": float},
                    "schema_compliance":   {"score": float, "weight": float, "weighted": float},
                    "security_isolation":  {"score": float, "weight": float, "weighted": float},
                },
                "change_delta": int,
                "merge_threshold": float,
            }
        """
        config = _load_weights_config()
        weights = config["weights"]
        merge_threshold = config["merge_threshold"]

        # ── Sub-score: bootstrap_integrity (ADR-001) ─────────────────────────
        bootstrap_score = 1.0 if integrity_passed else 0.0

        # ── Sub-score: hook_results (dependency integrity) ───────────────────
        hook_scores = hook_results.get("hook_scores", {})
        if hook_scores:
            hook_score = sum(hook_scores.values()) / len(hook_scores)
        elif hook_results.get("success", True):
            # No hooks discovered but success=True → treat as 1.0
            hook_score = 1.0
        else:
            hook_score = 0.0

        # ── Sub-score: schema_compliance (ADR-003) ───────────────────────────
        # Currently evaluated implicitly — manifests pass schema validation
        # via the dashboard API.  Future: explicit schema check on changed
        # manifest files.  For now, always 1.0 (no violations detected).
        schema_score = 1.0

        # ── Sub-score: security_isolation (ADR-002) ──────────────────────────
        # Currently evaluated implicitly — volume mounts are configured in
        # kntic.yml.  Future: automated mount audit against ADR-002 rules.
        # For now, always 1.0 (no violations detected).
        security_score = 1.0

        # ── Composite score ──────────────────────────────────────────────────
        # Δ is currently 1 (see docstring).
        change_delta = max(len(changed_files), 1)
        delta_normaliser = 1  # reserved for future use

        raw_scores = {
            "bootstrap_integrity": bootstrap_score,
            "hook_results": hook_score,
            "schema_compliance": schema_score,
            "security_isolation": security_score,
        }

        dimensions = {}
        weighted_sum = 0.0
        for dim, score in raw_scores.items():
            w = weights.get(dim, 0.0)
            weighted = score * w
            weighted_sum += weighted
            dimensions[dim] = {
                "score": round(score, 4),
                "weight": round(w, 4),
                "weighted": round(weighted, 4),
            }

        alignment_score = round(weighted_sum / delta_normaliser, 4)

        return {
            "alignment_score": alignment_score,
            "dimensions": dimensions,
            "change_delta": change_delta,
            "merge_threshold": merge_threshold,
        }

    def execute_gia(self):
        """The main Global Impact Analysis entry point.

        Computes the continuous Alignment Score (Whitepaper §3) alongside the
        existing pass/fail status.  The report now includes:
          - ``alignment_score`` (float 0.0–1.0)
          - ``dimensions`` (per-ADR sub-score breakdown)
          - ``merge_threshold`` (configurable minimum for pass)

        The pass/fail gate uses the configurable merge threshold:
          - alignment_score >= merge_threshold → "pass"
          - alignment_score < merge_threshold  → "fail"

        After computing the result the report is persisted to
        GIA_STATE_PATH (.kntic/gia/state.json) so the Dashboard can read the
        health status without running its own subprocess (INIT-012 decoupling).
        """
        integrity_passed = self.verify_system_integrity()

        if not integrity_passed:
            # Bootstrap failure is critical — still compute score for visibility
            changed_files = self.get_changed_files()
            hook_results = {"success": False, "failed_hooks": [], "logs": "", "hook_scores": {}, "drift_items": []}
            scoring = self.compute_alignment_score(
                integrity_passed=False,
                hook_results=hook_results,
                changed_files=changed_files,
            )
            report = {
                "status": "fail",
                "reason": "Bootstrap Protection: Core logic is broken or unimportable.",
                "alignment_score": scoring["alignment_score"],
                "dimensions": scoring["dimensions"],
                "change_delta": scoring["change_delta"],
                "merge_threshold": scoring["merge_threshold"],
                "drift_items": [],
            }
            _write_gia_state(report)
            return report

        hook_results = self.run_hooks()
        changed_files = self.get_changed_files()
        drift_items = hook_results.get("drift_items", [])

        scoring = self.compute_alignment_score(
            integrity_passed=True,
            hook_results=hook_results,
            changed_files=changed_files,
        )

        # Determine pass/fail using configurable merge threshold
        if scoring["alignment_score"] >= scoring["merge_threshold"]:
            report = {
                "status": "pass",
                "files_validated": changed_files,
                "alignment_score": scoring["alignment_score"],
                "dimensions": scoring["dimensions"],
                "change_delta": scoring["change_delta"],
                "merge_threshold": scoring["merge_threshold"],
                "drift_items": drift_items,
            }
        else:
            failed_hooks = hook_results.get("failed_hooks", [])
            reason_parts = []
            if failed_hooks:
                reason_parts.append(f"Hook(s) failed: {', '.join(failed_hooks)}")
            reason_parts.append(
                f"Alignment score {scoring['alignment_score']:.4f} "
                f"below threshold {scoring['merge_threshold']:.4f}"
            )
            report = {
                "status": "fail",
                "reason": ". ".join(reason_parts),
                "logs": hook_results.get("logs", ""),
                "alignment_score": scoring["alignment_score"],
                "dimensions": scoring["dimensions"],
                "change_delta": scoring["change_delta"],
                "merge_threshold": scoring["merge_threshold"],
                "drift_items": drift_items,
            }

        _write_gia_state(report)
        return report

if __name__ == "__main__":
    validator = KineticValidator()
    report = validator.execute_gia()
    print(json.dumps(report, indent=2))
    sys.exit(0 if report["status"] == "pass" else 1)
