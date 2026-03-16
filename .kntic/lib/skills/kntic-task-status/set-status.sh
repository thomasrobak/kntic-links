#!/usr/bin/env bash
# set-status.sh — Atomically update a KNTIC task manifest status
# Usage: ./set-status.sh <manifest_path> <new_status>
#
# Validates against ADR-001 FSM, updates status + updated_at + actions array.
# Uses atomic tmp+rename to prevent manifest corruption.

set -euo pipefail

# --- Argument validation ---
if [ $# -ne 2 ]; then
    echo "Error: Expected 2 arguments: <manifest_path> <new_status>" >&2
    echo "Usage: $0 <manifest_path> <new_status>" >&2
    exit 1
fi

MANIFEST_PATH="$1"
NEW_STATUS="$2"

# --- Path traversal prevention ---
# Normalize the path to catch ../ tricks
RESOLVED_PATH="$(realpath -m "$MANIFEST_PATH" 2>/dev/null || echo "$MANIFEST_PATH")"

# Must end in .json
if [[ "$MANIFEST_PATH" != *.json ]]; then
    echo "Error: Manifest path must end in .json (got: $MANIFEST_PATH)" >&2
    exit 1
fi

# Must be under .kntic/manifests/
# Check both the literal path and the resolved path
if [[ "$MANIFEST_PATH" != .kntic/manifests/* && "$MANIFEST_PATH" != ./.kntic/manifests/* && "$RESOLVED_PATH" != */\.kntic/manifests/* ]]; then
    echo "Error: Manifest path must be under .kntic/manifests/ (got: $MANIFEST_PATH)" >&2
    exit 1
fi

# --- Status validation (ADR-001 agent-allowed statuses only) ---
ALLOWED_STATUSES="todo in_progress refactoring needs_review ready_for_merge"
VALID=0
for s in $ALLOWED_STATUSES; do
    if [ "$NEW_STATUS" = "$s" ]; then
        VALID=1
        break
    fi
done

if [ "$VALID" -ne 1 ]; then
    echo "Error: Invalid status '$NEW_STATUS'. Allowed: $ALLOWED_STATUSES" >&2
    if [ "$NEW_STATUS" = "merged" ]; then
        echo "Hint: 'merged' is set only by the Orchestrator after GIA passes." >&2
    elif [ "$NEW_STATUS" = "backlog" ]; then
        echo "Hint: 'backlog' is set only by humans." >&2
    fi
    exit 1
fi

# --- File existence check ---
if [ ! -f "$MANIFEST_PATH" ]; then
    echo "Error: Manifest file not found: $MANIFEST_PATH" >&2
    exit 1
fi

# --- Read existing manifest ---
EXISTING_JSON="$(cat "$MANIFEST_PATH")" || {
    echo "Error: Failed to read manifest: $MANIFEST_PATH" >&2
    exit 1
}

# Validate it's valid JSON
echo "$EXISTING_JSON" | python3 -c "import sys, json; json.load(sys.stdin)" 2>/dev/null || {
    echo "Error: Manifest is not valid JSON: $MANIFEST_PATH" >&2
    exit 1
}

# --- Generate timestamp ---
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%S.%6NZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)"

# --- Update manifest via Python (available in node:22-slim via system) ---
UPDATED_JSON="$(echo "$EXISTING_JSON" | python3 -c "
import sys, json

data = json.load(sys.stdin)
data['status'] = '$NEW_STATUS'
data['updated_at'] = '$TIMESTAMP'

# Append to actions array
if 'actions' not in data:
    data['actions'] = []
data['actions'].append({
    'timestamp': '$TIMESTAMP',
    'status': '$NEW_STATUS'
})

json.dump(data, sys.stdout, indent=2)
")" || {
    echo "Error: Failed to update manifest JSON" >&2
    exit 1
}

# --- Atomic write: tmp file + rename ---
MANIFEST_DIR="$(dirname "$MANIFEST_PATH")"
TMP_FILE="$(mktemp "${MANIFEST_DIR}/.tmp.XXXXXX")" || {
    echo "Error: Failed to create temp file in $MANIFEST_DIR" >&2
    exit 1
}

# Write to tmp file
echo "$UPDATED_JSON" > "$TMP_FILE" || {
    rm -f "$TMP_FILE"
    echo "Error: Failed to write to temp file" >&2
    exit 1
}

# Atomic rename
mv "$TMP_FILE" "$MANIFEST_PATH" || {
    rm -f "$TMP_FILE"
    echo "Error: Failed to rename temp file to $MANIFEST_PATH" >&2
    exit 1
}

echo "✅ Manifest updated: status → '$NEW_STATUS' ($MANIFEST_PATH)"
exit 0
