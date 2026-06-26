# Versioning

**vibebar::** (the VibeBar desktop app) uses [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.

| Bump | When | Example |
|------|------|---------|
| **PATCH** (`1.1.0` → `1.1.1`) | Bug fixes, docs-only repo changes that ship with a patch release | `fix:` commits |
| **MINOR** (`1.1.0` → `1.2.0`) | New features, backward-compatible behavior | `feat:` commits |
| **MAJOR** (`1.x` → `2.0.0`) | Breaking UX, settings migration, or MCP contract changes | Rare; discuss first |

**Current release:** `1.1.0`  
**Next planned minor:** `1.2.0`

## Single source of truth

The app semver lives in **`apps/vibebar/package.json`**. Runtime code reads it via `apps/vibebar/src/shared/appVersion.ts` (MCP server identity, Agent Companion client info, etc.).

Electron-builder artifact names derive from that same field:

- `vibebar-1.1.0-setup.exe`
- `vibebar-1.1.0-portable.exe`

## Release checklist (maintainers)

When cutting a release (e.g. `1.2.0`):

1. **Bump versions** in all workspace `package.json` files (keep them in sync):
   - `package.json` (root monorepo)
   - `apps/vibebar/package.json` ← drives the installer
   - `packages/codesync/package.json`
   - `packages/prompt-engine/package.json`
   - `packages/prompt-packs/package.json`
   - `packages/project-detector/package.json`
2. Run `npm install` at the repo root to refresh `package-lock.json`.
3. Update **`CHANGELOG.md`** with the new section and date.
4. Update **README.md** “Current release” line if you pin a specific tag.
5. Update **`docs/.vitepress/config.ts`** footer version string (e.g. `v1.2.0`).
6. Run quality gates:
   ```bash
   npm run typecheck
   npm test
   npm run build
   npm run dist
   ```
7. Create a GitHub Release tagged **`vX.Y.Z`** (with leading `v`) and attach the installer/portable artifacts from `apps/vibebar/release/`.
8. Push to `main` — the **Deploy wiki** workflow republishes docs automatically.

No separate hardcoded version strings should remain outside `package.json` (MCP/ACP read `APP_VERSION`).

## Git tags

Release tags use a **`v` prefix**: `v1.1.0`, `v1.2.0`. Issue templates and support docs refer to the tag or commit SHA.

## What we do not version-lock

- Third-party npm dependency versions in `package-lock.json` (update independently).
- PolyForm license text version in `LICENSE` (legal document, not app semver).
- Test fixture `package.json` files under `packages/project-detector/__fixtures__/`.
