#!/usr/bin/env bash
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="${HOME}/.gemini/config/plugins/git-manager"

mkdir -p "${TARGET_DIR}"

rsync -a --delete \
  --exclude 'test/' \
  --exclude '.git/' \
  --exclude '.DS_Store' \
  --exclude 'install.sh' \
  "${SRC_DIR}/" "${TARGET_DIR}/"

echo "已同步原生插件到: ${TARGET_DIR}"
