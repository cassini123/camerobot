#!/usr/bin/env bash
set -euo pipefail
OUT="${1:-public/explore}"
mkdir -p "$OUT"

copy_or_make() {
  local dest="$1" src="${2:-}" w="$3" h="$4" hue="$5"
  if [[ -n "$src" && -f "$src" ]]; then
    ffmpeg -y -hide_banner -loglevel error -i "$src" -an \
      -c:v libx264 -preset veryfast -crf 28 -pix_fmt yuv420p -movflags +faststart \
      -vf "scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}" \
      "$dest"
    return
  fi
  ffmpeg -y -hide_banner -loglevel error \
    -f lavfi -i "testsrc2=size=${w}x${h}:rate=24:duration=2.4" \
    -vf "hue=h=${hue}:s=1.2,eq=contrast=1.05:brightness=-0.05,format=yuv420p" \
    -an -c:v libx264 -preset veryfast -crf 30 -movflags +faststart "$dest"
}

WECHAT="/Users/cassini/Library/Containers/com.tencent.xinWeChat/Data/Library/Application Support/com.tencent.xinWeChat/2.0b4.0.9/efc4be5c574a50a3cd318f2aaad34bb2/Message/MessageTemp/bc5ed6538e69ec1e41bdad7bc9c1edac/Video"
DL="/Users/cassini/Downloads"

copy_or_make "$OUT/clip-static.mp4" "$WECHAT/2297_1787921505.mp4" 720 1280 20
copy_or_make "$OUT/clip-dolly-in.mp4" "$WECHAT/2295_1787921500.mp4" 960 720 90
copy_or_make "$OUT/clip-dolly-out.mp4" "$WECHAT/2293_1787921497.mp4" 720 900 200
copy_or_make "$OUT/clip-pan.mp4" "$WECHAT/2292_1787921495.mp4" 1280 720 40
copy_or_make "$OUT/clip-track.mp4" "$WECHAT/2291_1787921492.mp4" 540 960 140

shopt -s nullglob
pv=("$DL"/jimeng-2026-08-28-4643-*.mp4)
track=("$DL"/jimeng-2026-08-28-4482-*.mp4)
drone=("$DL"/jimeng-2026-08-28-1669-*.mp4)

copy_or_make "$OUT/clip-pv.mp4" "${pv[0]:-}" 1280 720 30
copy_or_make "$OUT/clip-market.mp4" "${track[0]:-}" 1280 720 330
copy_or_make "$OUT/clip-drone.mp4" "${drone[0]:-}" 1280 720 180
