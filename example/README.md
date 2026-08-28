# Example reconstruction

Local 3D reconstruction used as a space example for Yunjing / Camerobot.

| File | Size | Format |
| --- | --- | --- |
| [`model.ply`](./model.ply) | 3.29 GB (`3528201479` bytes) | 3D Gaussian Splatting PLY |

`model.ply` is binary little-endian, **14,950,000** Gaussians (`x/y/z`, SH
`f_dc_*` / `f_rest_*`, `opacity`, `scale_*`, `rot_*`). It is a reconstruction
asset, not a triangle mesh.

This file is **not** committed. GitHub rejects blobs over 100 MB, and Git LFS
caps a single file at 2 GB. Keep `model.ply` on disk (or fetch it) and leave
the Git ignore rules in place.

## Fetch

```bash
./example/fetch-model.sh
```

Source (Google Drive, public link):

https://drive.google.com/file/d/1dER19eZQjYYYUvTwdxEmnOAQIl9JLgcx/view?usp=drive_link

The script writes `example/model.ply` via `gdown` (handles Drive's large-file
virus-scan interstitial). Re-run with `--force` to replace an existing file.
