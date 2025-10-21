#!/usr/bin/env bash
# Sync CUB plugin bundles from cub.rip into the local plugins/cub directory.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_DIR="$REPO_ROOT/plugins/cub"
BASE_URL="https://cub.rip/plugin"
PLUGINS=(
  cardify
  collections
  dlna
  etor
  interface
  iptv
  quality
  radio
  tmdb-proxy
  tracks
  trailers
)

mkdir -p "$TARGET_DIR"
status=0

for plugin in "${PLUGINS[@]}"; do
  tmp_file="$(mktemp)"

  if ! curl --fail --silent --show-error "$BASE_URL/$plugin" -o "$tmp_file"; then
    echo "Failed to download $plugin" >&2
    rm -f "$tmp_file"
    status=1
    continue
  fi

  target_file="$TARGET_DIR/$plugin"

  if [[ -f "$target_file" ]] && cmp -s "$tmp_file" "$target_file"; then
    echo "Already up to date: $plugin"
    rm -f "$tmp_file"
    continue
  fi

  mv "$tmp_file" "$target_file"
  echo "Updated: $plugin"
done

exit "$status"
