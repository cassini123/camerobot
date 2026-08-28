# Example reconstruction

Local 3D reconstruction used as a space example for Yunjing / Camerobot.

| File | Size | Format | Web quality |
| --- | --- | --- | --- |
| [`model.plz`](./model.plz) / `.spz` / `.sog` | typically 40–400 MB | compressed 3DGS | **use this** |
| [`model.ply`](./model.ply) | 3.29 GB (`3528201479` bytes) | uncompressed 3DGS PLY | local archive only |
| [`../public/example/model.ply`](../public/example/model.ply) | 2.6 MB | xyz + RGB preview | not the scan |

The Drive file is binary little-endian, **14,950,000** Gaussians. GitHub and
Vercel cannot host 3.3 GB, and a browser tab cannot decode that PLY as real
splats (Spark `paged` only works with `.rad`, not raw PLY). VirtuPath therefore
looks for a **compressed** sibling first:

`example/model.plz` → `model.spz` → `model.sog` → `model.zip` → `model.rad`

On Vercel set `EXAMPLE_SPLAT_URL` to a public compressed file (R2 / S3 / Drive
direct). Do **not** set it to the 3.29GB PLY.

Keep the full `example/model.ply` gitignored for local conversion.

## Convert PLY → PLZ / SPZ / SOG

1. Open the 3.29GB PLY in [SuperSplat](https://playcanvas.com/super-splat) (desktop, not the browser tab if RAM is tight).
2. Export **compressed PLY**, **SOG**, or a **ZIP/PLZ** pack. Target well under 500MB.
3. Save as `example/model.plz` (or `.spz` / `.sog`) and restart `npm run dev`.
4. VirtuPath → Apply **Example · 扫描**.

Niantic SPZ and Spark `.rad` (true LOD streaming) also work. A desktop/Electron
app does **not** magically make a 3GB PLY web-friendly; compress first, then
optionally wrap the same web viewer.

## Fetch the full scan (archive)

```bash
./example/fetch-model.sh
```

Source (Google Drive, public link):

https://drive.google.com/file/d/1dER19eZQjYYYUvTwdxEmnOAQIl9JLgcx/view?usp=drive_link
