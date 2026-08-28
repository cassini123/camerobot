#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/model.spz"
SRC="${1:-}"
FORCE=0

usage() {
  echo "Usage: $0 [--force] <google-drive-url-or-file-id>"
  echo "Download a .spz into example/model.spz so VirtuPath can load it."
}

for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=1 ;;
    -h|--help)
      usage
      exit 0
      ;;
  esac
done

if [[ -z "$SRC" || "$SRC" == "--force" || "$SRC" == "-f" ]]; then
  # allow: ./fetch-spz.sh --force URL
  for arg in "$@"; do
    if [[ "$arg" != "--force" && "$arg" != "-f" && "$arg" != "-h" && "$arg" != "--help" ]]; then
      SRC="$arg"
    fi
  done
fi

if [[ -z "$SRC" ]]; then
  usage >&2
  exit 2
fi

if [[ -f "$OUT" && "$FORCE" -ne 1 ]]; then
  echo "Already present: $OUT ($(du -h "$OUT" | cut -f1))"
  echo "Pass --force to download again."
  exit 0
fi

if ! command -v gdown >/dev/null 2>&1; then
  python3 -m pip install --user -q gdown
  export PATH="${HOME}/.local/bin:${PATH}"
fi

echo "Downloading SPZ → $OUT"
gdown "$SRC" -O "$OUT"
ls -lh "$OUT"
