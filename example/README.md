# Example reconstruction

Local 3D reconstruction used as a space example for Yunjing / Camerobot.

**If you already have both PLY and SPZ: send / use the SPZ.** Do not reconvert.
The original 3.29GB Gaussian PLY is the archive; VirtuPath on the web loads SPZ.

| File | Size | Format | Use |
| --- | --- | --- | --- |
| [`model.spz`](./model.spz) | typically 80–400 MB | Niantic 3DGS | **web / VirtuPath** |
| [`model.ply`](./model.ply) | 3.29 GB | uncompressed 3DGS | archive / re-export only |
| [`../public/example/model.ply`](../public/example/model.ply) | 2.6 MB | xyz + RGB preview | not the scan |

VirtuPath looks for, in order:

`example/model.spz` → `model.plz` → `model.sog` → `model.zip` → `model.rad`

On Vercel set `EXAMPLE_SPLAT_URL` to a public **SPZ** (R2 / S3). Do not point it at the 3.29GB PLY.

## Drop in your SPZ

```bash
cp /path/to/your.spz example/model.spz
npm run dev
```

Then VirtuPath → Apply **Example · 扫描**. Or upload the SPZ in the workbench.

## Convert PLY → SPZ (only if you do not have SPZ)

Needs ~16GB RAM for a 3GB Gaussian PLY. Keeps spherical harmonics.

```bash
npm run splat:spz
# or: ./example/to-spz.sh /path/to/model.ply example/model.spz
```

## Fetch the full PLY archive

```bash
./example/fetch-model.sh
```

https://drive.google.com/file/d/1dER19eZQjYYYUvTwdxEmnOAQIl9JLgcx/view?usp=drive_link
