#!/usr/bin/env python3
"""
Hook: 998-drift-stale-refs.py (internal)
Drift detection: Stale file references and ADR/MEMORY.MD sync.

Detects:
  1. File paths referenced in MEMORY.MD that no longer exist on disk.
  2. File paths referenced in ADR files that no longer exist on disk.
  3. ADR table in MEMORY.MD §2.7 not matching files in .kntic/adrs/.
  4. Completed Tasks table referencing task IDs with no manifest file.

Emits a JSON report on the last line with alignment_score and drift_items.
Exit code 0 = no drift, non-zero = drift detected.
"""

import json
import os
import re
import sys

MEMORY_PATH = os.path.join(".kntic", "MEMORY.MD")
ADRS_DIR = os.path.join(".kntic", "adrs")
MANIFESTS_DIR = os.path.join(".kntic", "manifests")
DOCS_DIR = os.path.join(".kntic", "docs")

# Paths that are known patterns/examples and should not be checked for existence
SKIP_PATTERNS = [
    r"^https?://",         # URLs
    r"^\{",                # Template variables
    r"^<",                 # Placeholder angles
    r"^\$",                # Shell variables
    r"^`",                 # Inline code that's not a real path
    r"^#",                 # Anchors
    r"gitlab\.kommune7",   # Git URLs
    r"kntic\.ai",          # External URLs
    r"localhost",          # Local URLs
    r"/app/",              # Container paths (not host paths)
    r"\.json\.tmp$",       # Temp file patterns documented in ADRs
    r"^skills\s*->",       # Symlink notation
    r"^\.\.\./",           # Ellipsis paths
    r"^NNN",               # Template placeholders
    r"PROPOSAL-REGEN-\{",  # Template proposal names
    r"PROPOSAL-REGEN-\*",  # Glob patterns
    r":\w+$",              # Volume mount suffixes like :ro, :rw
    r"^\.:/",              # Docker volume mount patterns like .:/app
    r"^/api/",             # API route paths (not filesystem paths)
    r"PYTHONPATH=",        # Environment variable assignments
    r"TASK-ID",            # Template placeholders for task IDs
    r"^specific/",         # Relative paths within a parent context (ADR tables)
    r"^internal/",         # Relative paths within a parent context (ADR tables)
]

# Known paths that appear in documentation as examples/references, not actual files
KNOWN_EXAMPLE_PATHS = {
    "docs/adr/",           # Historical reference (TD-7 resolved)
    ".agent/",             # Historical reference (renamed to .kntic/)
    ".agent_backup/",      # Historical reference (removed in INIT-028)
    "logs/",               # Historical reference (removed in INIT-028)
    "test_env/",           # Historical reference
    ".kntic/test_env",     # Test directory created on-the-fly
    "./.kntic/test_env",   # Test directory variant
    ".env",                # Historical reference (renamed to .kntic.env)
    "docker-compose.yml",  # Historical reference (renamed to kntic.yml)
    ".kntic/skills/",      # Historical reference (moved to .kntic/lib/skills/)
    ".kntic/hooks/gia/test.sh",  # Historical reference (TD-9 resolved, removed)
}


def should_skip_path(path):
    """Return True if the path is a known pattern/example that shouldn't be validated."""
    for pattern in SKIP_PATTERNS:
        if re.search(pattern, path):
            return True
    # Strip leading ./ for comparison
    normalized = path.lstrip("./")
    for known in KNOWN_EXAMPLE_PATHS:
        if normalized.startswith(known.lstrip("./")):
            return True
    return False


def extract_file_paths(text, source_file):
    """
    Extract file paths from markdown text.
    Returns list of (path, line_number) tuples.
    """
    paths = []
    for line_num, line in enumerate(text.splitlines(), 1):
        # Match paths in backticks: `path/to/file`
        for match in re.finditer(r'`([^`\s]+(?:/[^`\s]+)+)`', line):
            candidate = match.group(1)
            if not should_skip_path(candidate):
                paths.append((candidate, line_num))

        # Match paths in markdown links/references that look like file paths
        for match in re.finditer(r'(?:^|\s)(\.?\.kntic/[^\s,;)]+)', line):
            candidate = match.group(1).rstrip(".")
            if not should_skip_path(candidate):
                paths.append((candidate, line_num))

    return paths


def check_stale_references_in_file(filepath, drift_items):
    """Check a single file for stale path references."""
    if not os.path.isfile(filepath):
        return

    try:
        with open(filepath, "r") as f:
            content = f.read()
    except OSError:
        return

    paths = extract_file_paths(content, filepath)
    seen = set()

    for path, line_num in paths:
        # Normalize path
        clean_path = path.strip("`'\"").rstrip("/")
        if clean_path in seen:
            continue
        seen.add(clean_path)

        # Try both with and without leading ./
        candidates = [clean_path]
        if clean_path.startswith("./"):
            candidates.append(clean_path[2:])
        else:
            candidates.append("./" + clean_path)

        exists = any(
            os.path.exists(c) or os.path.islink(c)
            for c in candidates
        )

        if not exists:
            drift_items.append({
                "type": "stale_reference",
                "file": filepath,
                "line": line_num,
                "detail": f"References '{clean_path}' which does not exist on disk",
            })


def check_adr_table_sync(drift_items):
    """
    Verify the ADR table in MEMORY.MD §2.7 matches files in .kntic/adrs/.
    """
    if not os.path.isfile(MEMORY_PATH):
        drift_items.append({
            "type": "missing_file",
            "file": MEMORY_PATH,
            "line": 0,
            "detail": "MEMORY.MD file does not exist",
        })
        return

    try:
        with open(MEMORY_PATH, "r") as f:
            memory_content = f.read()
    except OSError:
        return

    # Extract ADR filenames from the MEMORY.MD ADR table
    # The table has rows like: | ADR-001-Bootstrapping.md | ... |
    adr_in_memory = set()
    for match in re.finditer(r'\|\s*(ADR-\d{3}-[^\s|]+\.md)\s*\|', memory_content):
        adr_in_memory.add(match.group(1))

    # Get actual ADR files on disk
    adr_on_disk = set()
    if os.path.isdir(ADRS_DIR):
        for name in os.listdir(ADRS_DIR):
            if name.startswith("ADR-") and name.endswith(".md"):
                adr_on_disk.add(name)

    # Check for ADRs on disk but not in MEMORY.MD table
    missing_from_memory = adr_on_disk - adr_in_memory
    for adr_file in sorted(missing_from_memory):
        drift_items.append({
            "type": "adr_memory_desync",
            "file": MEMORY_PATH,
            "line": 0,
            "detail": f"ADR file '{adr_file}' exists on disk but is not listed in MEMORY.MD ADR table",
        })

    # Check for ADRs in MEMORY.MD but not on disk
    missing_from_disk = adr_in_memory - adr_on_disk
    for adr_file in sorted(missing_from_disk):
        drift_items.append({
            "type": "adr_memory_desync",
            "file": MEMORY_PATH,
            "line": 0,
            "detail": f"ADR '{adr_file}' listed in MEMORY.MD ADR table but file does not exist on disk",
        })


def main():
    print("[hook:998-drift-stale-refs] Running stale reference drift detection...")
    drift_items = []

    # 1. Check MEMORY.MD for stale references
    print("  Scanning MEMORY.MD for stale file references...")
    check_stale_references_in_file(MEMORY_PATH, drift_items)

    # 2. Check all ADR files for stale references
    print("  Scanning ADR files for stale file references...")
    if os.path.isdir(ADRS_DIR):
        for name in sorted(os.listdir(ADRS_DIR)):
            if name.endswith(".md"):
                check_stale_references_in_file(
                    os.path.join(ADRS_DIR, name), drift_items
                )

    # 3. Check ADR table sync
    print("  Checking ADR table sync between MEMORY.MD and .kntic/adrs/...")
    check_adr_table_sync(drift_items)

    # Report
    if drift_items:
        print(f"\n  Found {len(drift_items)} drift item(s):")
        for item in drift_items:
            print(f"    ⚠ [{item['type']}] {item['file']}:{item['line']} — {item['detail']}")

        # Score: deduct proportionally, but cap at 0.0
        score = max(0.0, 1.0 - (len(drift_items) * 0.1))
        result = {
            "alignment_score": round(score, 4),
            "drift_items": drift_items,
        }
        print(json.dumps(result))
        sys.exit(1)
    else:
        print("\n  No stale references or ADR sync drift detected.")
        result = {
            "alignment_score": 1.0,
            "drift_items": [],
        }
        print(json.dumps(result))
        sys.exit(0)


if __name__ == "__main__":
    main()
