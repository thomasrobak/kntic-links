#!/usr/bin/env bash
# GIA hook: run unit tests after every task
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$REPO_ROOT"

npm test
