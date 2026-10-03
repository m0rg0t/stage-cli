#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
sandbox=$(mktemp -d)
trap 'rm -rf "$sandbox"' EXIT
mkdir -p "$sandbox"/{home,config,cache,data,tmp,bin}
for command in gh claude codex gemini opencode ssh curl wget xdg-open open; do
  cat > "$sandbox/bin/$command" <<'SHIM'
#!/bin/sh
printf '%s\n' "Unexpected external command: ${0##*/}" >> "$STAGE_DENY_LOG"
exit 97
SHIM
  chmod +x "$sandbox/bin/$command"
done
: > "$sandbox/denied.log"
: > "$sandbox/network.log"
cd "$root"
command=(node node_modules/vitest/vitest.mjs run --pool=forks --maxWorkers=2)
if [ "${1:-}" = "--package" ]; then
  command=(node --test scripts/package-contract.test.js)
  shift
fi
status=0
env -i PATH="$sandbox/bin:$PATH" HOME="$sandbox/home" \
  XDG_CONFIG_HOME="$sandbox/config" XDG_CACHE_HOME="$sandbox/cache" \
  XDG_DATA_HOME="$sandbox/data" GH_CONFIG_DIR="$sandbox/config/gh" \
  TMPDIR="$sandbox/tmp" CI=true HUSKY=0 \
  GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null GIT_CONFIG_NOSYSTEM=1 \
  GIT_TERMINAL_PROMPT=0 GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory \
  GIT_CONFIG_VALUE_0="$root" GIT_ALLOW_PROTOCOL=file \
  STAGE_DENY_LOG="$sandbox/denied.log" STAGE_VERIFY_OFFLINE=true \
  OFFLINE_NETWORK_LOG="$sandbox/network.log" \
  NODE_OPTIONS="--require=$root/scripts/offline-network-guard.cjs" \
  "${command[@]}" "$@" || status=$?
if [ -s "$sandbox/denied.log" ] || [ -s "$sandbox/network.log" ]; then
  cat "$sandbox/denied.log" "$sandbox/network.log" >&2
  exit 1
fi
exit "$status"
