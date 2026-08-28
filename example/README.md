# Example reconstruction

Local 3D reconstruction used as a space example for Yunjing / Camerobot.

| File | Size | Format |
| --- | --- | --- |
| [`model.ply`](./model.ply) | 3.29 GB (`3528201479` bytes) | 3D Gaussian Splatting PLY |
| [`../public/example/model.ply`](../public/example/model.ply) | 2.6 MB | xyz + RGB preview (180,121 points) |

The Drive file is binary little-endian, **14,950,000** Gaussians (`x/y/z`, SH
`f_dc_*` / `f_rest_*`, `opacity`, `scale_*`, `rot_*`). GitHub and Vercel cannot
host 3.3 GB, so the app ships a sampled preview and the workbench MODELS list
exposes **Example · model.ply**.

Keep the full `example/model.ply` on disk (or fetch it) for local work. It is
gitignored.

## Fetch the full scan

```bash
./example/fetch-model.sh
```

Source (Google Drive, public link):

https://drive.google.com/file/d/1dER19eZQjYYYUvTwdxEmnOAQIl9JLgcx/view?usp=drive_link

The script writes `example/model.ply` via `gdown` (handles Drive's large-file
virus-scan interstitial). Re-run with `--force` to replace an existing file.
