#!/usr/bin/env bash
# next build с обходом Bus error на Linux VPS (LD_PRELOAD, Tailwind WASI).
set -euo pipefail

export LD_PRELOAD=""
export NAPI_RS_FORCE_WASI=true
export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}"

exec npx next build "$@"
