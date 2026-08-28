#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
IN="${1:-$ROOT/model.ply}"
OUT="${2:-$ROOT/model.spz}"

if [[ ! -f "$IN" ]]; then
  echo "Missing input: $IN" >&2
  echo "Usage: $0 [input.ply] [output.spz]" >&2
  echo "If you already have an SPZ, copy it to example/model.spz instead of converting." >&2
  exit 1
fi

echo "Converting $IN → $OUT (keeps SH; do not pass --filter-harmonics)"
echo "A 3GB Gaussian PLY needs ~16GB RAM. Prefer using an existing .spz."

NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=16384}"
export NODE_OPTIONS

npx --yes @playcanvas/splat-transform "$IN" "$OUT"
ls -lh "$OUT"
