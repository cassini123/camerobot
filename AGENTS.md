# camerobot

Greenfield repository — no application source, dependency manifests, or service definitions yet.

## Cursor Cloud specific instructions

### Repository state

This repo currently contains only `README.md`. There is no runnable application, test suite, linter configuration, or CI pipeline to execute until source code and tooling are added.

### Available VM toolchain

The cloud VM provides these runtimes (no project-specific install step required yet):

| Tool | Version (approx.) |
|------|-------------------|
| Node.js | v22.x (via nvm) |
| npm / pnpm / yarn | Available on PATH |
| Python | 3.12 |
| Rust (cargo) | 1.83 |
| Go | 1.22 |
| Git | 2.43 |

Docker is **not** installed in the default cloud VM image.

### Running the application

Not applicable until an app is added. When code lands, update this section with:

- Package manager and install command (e.g. `npm install`, `uv sync`)
- Dev server command and port(s)
- Required environment variables (add a `.env.example`)

### Lint / test / build

No scripts exist yet. After adding tooling, document the standard commands here and reference `package.json` scripts, `Makefile` targets, or equivalent.

### Git workflow

- Default branch: `main`
- Remote: `https://github.com/cassini123/camerobot`
- Feature branches for cloud agents: `cursor/<descriptive-name>-4f9f`

### Update script

The VM startup update script is a no-op (`true`) because there are no dependencies to refresh. Replace it with the appropriate install command once a lockfile and manifest are committed.
