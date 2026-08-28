#!/usr/bin/env bash
set -Eeuo pipefail

EXTRACTOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCK_FILE="${EXTRACTOR_DIR}/.mapping_discovery.lock"

cd "$EXTRACTOR_DIR"
exec flock -n "$LOCK_FILE" ./venv/bin/python 6_discover_ongsys_mappings.py
