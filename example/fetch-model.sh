#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/model.ply"
FILE_ID="1dER19eZQjYYYUvTwdxEmnOAQIl9JLgcx"
FORCE=0

for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=1 ;;
    -h|--help)
      echo "Usage: $0 [--force]"
      echo "Download example/model.ply (~3.3GB) from Google Drive."
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

if [[ -f "$OUT" && "$FORCE" -ne 1 ]]; then
  echo "Already present: $OUT ($(du -h "$OUT" | cut -f1))"
  echo "Pass --force to download again."
  exit 0
fi

if ! command -v gdown >/dev/null 2>&1; then
  python3 -m pip install --user -q gdown
  export PATH="${HOME}/.local/bin:${PATH}"
fi

echo "Downloading model.ply (~3.3GB) to $OUT"
gdown "$FILE_ID" -O "$OUT"
ls -lh "$OUT"
