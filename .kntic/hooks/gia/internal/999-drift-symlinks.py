#!/usr/bin/env python3
"""
Hook: 999-drift-symlinks.py (internal)
Drift detection: Symlink integrity and TD resolution consistency.

Detects:
  1. Broken symlinks in the project (especially skills/ → .kntic/lib/skills/).
  2. Known symlinks pointing to wrong targets.
  3. TD items marked resolved in MEMORY.MD but still referenced as open elsewhere.
  4. TD items open in MEMORY.MD but missing a corresponding manifest.

Emits a JSON report on the last line with alignment_score and drift_items.
Exit code 0 = no drift, non-zero = drift detected.
"""

import json
import os
import re
import sys

MEMORY_PATH = os.path.join(".kntic", "MEMORY.MD")
MANIFESTS_DIR = os.path.join(".kntic", "manifests")

# Known symlinks and their expected targets (from MEMORY.MD §2.7)
EXPECTED_SYMLINKS = {
    "skills": os.path.join(".kntic", "lib", "skills"),
}

# Directories to scan for broken symlinks
SCAN_DIRS = [
    ".",
    ".kntic",
    ".kntic/lib",
    ".kntic/hooks",
    ".kntic/hooks/gia",
    ".kntic/hooks/gia/specific",
    ".kntic/hooks/gia/internal",
]


def check_symlink_integrity(drift_items):
    """Verify known symlinks point to valid, correct targets."""
    print("  Checking known symlink integrity...")

    for link_path, expected_target in EXPECTED_SYMLINKS.items():
        if not os.path.islink(link_path):
            if os.path.exists(link_path):
                drift_items.append({
                    "type": "symlink_not_link",
                    "file": link_path,
                    "line": 0,
                    "detail": f"'{link_path}' exists but is not a symlink (expected symlink → '{expected_target}')",
                })
            else:
                drift_items.append({
                    "type": "symlink_missing",
                    "file": link_path,
                    "line": 0,
                    "detail": f"Expected symlink '{link_path}' does not exist (should point to '{expected_target}')",
                })
            continue

        actual_target = os.readlink(link_path)
        if actual_target != expected_target:
            drift_items.append({
                "type": "symlink_wrong_target",
                "file": link_path,
                "line": 0,
                "detail": f"Symlink '{link_path}' points to '{actual_target}' but expected '{expected_target}'",
            })

        if not os.path.exists(link_path):
            drift_items.append({
                "type": "symlink_broken",
                "file": link_path,
                "line": 0,
                "detail": f"Symlink '{link_path}' → '{actual_target}' is broken (target does not exist)",
            })


def check_broken_symlinks_in_tree(drift_items):
    """Scan project directories for any broken symlinks."""
    print("  Scanning for broken symlinks in project tree...")

    for scan_dir in SCAN_DIRS:
        if not os.path.isdir(scan_dir):
            continue
        try:
            for name in os.listdir(scan_dir):
                full_path = os.path.join(scan_dir, name)
                if os.path.islink(full_path) and not os.path.exists(full_path):
                    target = os.readlink(full_path)
                    # Don't duplicate items already caught by known symlink check
                    if full_path not in EXPECTED_SYMLINKS and name not in EXPECTED_SYMLINKS:
                        drift_items.append({
                            "type": "symlink_broken",
                            "file": full_path,
                            "line": 0,
                            "detail": f"Broken symlink: '{full_path}' → '{target}'",
                        })
        except OSError:
            continue


def check_td_resolution_consistency(drift_items):
    """
    Verify TD resolution status consistency:
    - Resolved TDs (~~strikethrough~~) should not have open manifests
    - Open TDs should have corresponding manifests or be tracked
    """
    print("  Checking TD resolution consistency...")

    if not os.path.isfile(MEMORY_PATH):
        return

    try:
        with open(MEMORY_PATH, "r") as f:
            memory_content = f.read()
    except OSError:
        return

    # Parse the TD table in §3
    resolved_tds = set()
    open_tds = set()
    in_debt_section = False

    for line in memory_content.splitlines():
        if re.match(r"^##\s+3\.\s+Known Technical Debt", line):
            in_debt_section = True
            continue
        if in_debt_section and re.match(r"^##\s+\d+\.", line):
            break
        if not in_debt_section:
            continue

        # Resolved: ~~TD-N~~
        for match in re.finditer(r"~~TD-(\d+)~~", line):
            resolved_tds.add(int(match.group(1)))

        # Open: TD-N (not struck through) — look for table rows starting with | TD-N
        for match in re.finditer(r"\|\s*TD-(\d+)\s*\|", line):
            td_num = int(match.group(1))
            # Check if this line also has strikethrough for this TD
            if f"~~TD-{td_num}~~" not in line:
                open_tds.add(td_num)

    # Check that resolved TDs don't have non-merged manifests
    if os.path.isdir(MANIFESTS_DIR):
        for name in os.listdir(MANIFESTS_DIR):
            td_match = re.match(r"^TD-(\d+)\.json$", name)
            if not td_match:
                continue
            td_num = int(td_match.group(1))
            if td_num in resolved_tds:
                # Read manifest to check status
                try:
                    with open(os.path.join(MANIFESTS_DIR, name), "r") as f:
                        manifest = json.load(f)
                    status = manifest.get("status", "")
                    if status not in ("merged", "ready_for_merge"):
                        drift_items.append({
                            "type": "td_resolution_inconsistency",
                            "file": MEMORY_PATH,
                            "line": 0,
                            "detail": (
                                f"TD-{td_num} is marked as resolved (strikethrough) in MEMORY.MD "
                                f"but manifest TD-{td_num}.json has status '{status}'"
                            ),
                        })
                except (json.JSONDecodeError, OSError):
                    pass


def main():
    print("[hook:999-drift-symlinks] Running symlink and TD consistency drift detection...")
    drift_items = []

    # 1. Check known symlink integrity
    check_symlink_integrity(drift_items)

    # 2. Scan for broken symlinks
    check_broken_symlinks_in_tree(drift_items)

    # 3. Check TD resolution consistency
    check_td_resolution_consistency(drift_items)

    # Report
    if drift_items:
        print(f"\n  Found {len(drift_items)} drift item(s):")
        for item in drift_items:
            print(f"    ⚠ [{item['type']}] {item['file']} — {item['detail']}")

        score = max(0.0, 1.0 - (len(drift_items) * 0.15))
        result = {
            "alignment_score": round(score, 4),
            "drift_items": drift_items,
        }
        print(json.dumps(result))
        sys.exit(1)
    else:
        print("\n  No symlink or TD consistency drift detected.")
        result = {
            "alignment_score": 1.0,
            "drift_items": [],
        }
        print(json.dumps(result))
        sys.exit(0)


if __name__ == "__main__":
    main()
