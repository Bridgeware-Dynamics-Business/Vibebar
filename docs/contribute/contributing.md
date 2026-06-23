# How to contribute

Thanks for improving VibeBar. This page summarizes the process. Full details are in [CONTRIBUTING.md](https://github.com/Bridgeware-Dynamics-Business/Vibebar/blob/main/CONTRIBUTING.md).

## Before you start

- **Pull requests only.** Nobody pushes directly to `main`.
- **Source-available license.** Read and use the code, fork to submit PRs, but do not distribute or ship a competing product without permission. See the [LICENSE](https://github.com/Bridgeware-Dynamics-Business/Vibebar/blob/main/LICENSE).
- **Security matters.** Changes go through IPC allowlists, Zod validation, and review. No secrets in commits.

Opening a PR means you agree to the [CLA](https://github.com/Bridgeware-Dynamics-Business/Vibebar/blob/main/CLA.md).

## Ways to help

| Channel | Good for |
|---------|----------|
| [Bug report](https://github.com/Bridgeware-Dynamics-Business/Vibebar/issues/new/choose) | Reproducible defects |
| [Feature request](https://github.com/Bridgeware-Dynamics-Business/Vibebar/issues/new/choose) | Ideas before large builds |
| Pull request | Code, tests, docs |
| Security tab | Private vulnerability reports |

## Development setup

**Node.js 20+** (maintainers use 22). **Windows 10/11** for the full overlay experience.

```bash
git clone https://github.com/<your-username>/Vibebar.git
cd Vibebar
git remote add upstream https://github.com/Bridgeware-Dynamics-Business/Vibebar.git
npm install
npm run dev
```

Before you push:

```bash
npm run typecheck
npm test
npm run build
```

## Pull request checklist

1. Sync your fork with `upstream/main`.
2. Branch from `main`: `feat/…`, `fix/…`, `docs/…`.
3. One logical change per PR.
4. Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, etc.
5. Fill the PR template. CI must pass.

## Edit this wiki

Docs live in `docs/` (VitePress). Local preview:

```bash
npm run docs:dev
```

Every page has **Edit this page on GitHub** in the footer. Merging to `main` runs the **Deploy wiki** workflow.

### One-time GitHub Pages setup (maintainers)

If deploy fails with `Failed to create deployment (status: 404)`, Pages is not configured yet:

1. Open [Settings → Pages](https://github.com/Bridgeware-Dynamics-Business/Vibebar/settings/pages).
2. Under **Build and deployment**, set **Source** to **GitHub Actions** (not "Deploy from a branch").
3. Re-run **Deploy wiki** from the Actions tab (or push a docs change).

Live URL: `https://bridgeware-dynamics-business.github.io/Vibebar/`

## Related

- [CONTRIBUTING.md](https://github.com/Bridgeware-Dynamics-Business/Vibebar/blob/main/CONTRIBUTING.md)
- [SECURITY.md](https://github.com/Bridgeware-Dynamics-Business/Vibebar/blob/main/.github/SECURITY.md)
