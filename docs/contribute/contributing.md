# Contributing

Thank you for helping improve VibeBar. This page summarizes the repo's contribution model — full details live in [CONTRIBUTING.md](https://github.com/Bridgeware-Dynamics-Business/Vibebar/blob/main/CONTRIBUTING.md) on GitHub.

## Ground rules

- **All changes go through pull requests** — nobody pushes directly to `main`.
- **Source-available license** — read, use, and contribute back; forking to submit PRs is allowed. Distribution or competing products require permission. See the [LICENSE](https://github.com/Bridgeware-Dynamics-Business/Vibebar/blob/main/LICENSE).
- **Security bar is high** — IPC allowlists, Zod validation, read-only project access (except explicit Code Sync destinations), no secrets in commits.

## Ways to contribute

| Channel | Use for |
|---------|---------|
| [Bug report](https://github.com/Bridgeware-Dynamics-Business/Vibebar/issues/new/choose) | Reproducible defects |
| [Feature request](https://github.com/Bridgeware-Dynamics-Business/Vibebar/issues/new/choose) | Ideas before large builds |
| Pull request | Code, docs, tests |
| Security tab | Private vulnerability reports — not public issues |

## Development setup

Requirements: **Node.js 20+** (maintainers use 22), **Windows 10/11** for full overlay testing.

```bash
git clone https://github.com/<your-username>/Vibebar.git
cd Vibebar
git remote add upstream https://github.com/Bridgeware-Dynamics-Business/Vibebar.git
npm install
npm run dev
```

Verify before pushing:

```bash
npm run typecheck
npm test
npm run build
```

## Pull request workflow

1. Sync `main` from upstream
2. Branch: `feat/…`, `fix/…`, `docs/…`
3. One logical change per PR
4. Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`
5. Open PR against `Bridgeware-Dynamics-Business/Vibebar` `main`
6. Fill the PR template; CI must pass

Opening a PR agrees to the [Contributor License Agreement (CLA)](https://github.com/Bridgeware-Dynamics-Business/Vibebar/blob/main/CLA.md).

## Contributing to this wiki

Wiki source lives in **`docs/`** (VitePress). To edit locally:

```bash
npm run docs:dev
```

Open the local URL, edit markdown under `docs/`, then open a PR. Pages deploy to GitHub Pages on merge to `main`.

## Edit this wiki

Every page has an **Edit this page on GitHub** link in the footer.

## Related

- [CONTRIBUTING.md](https://github.com/Bridgeware-Dynamics-Business/Vibebar/blob/main/CONTRIBUTING.md)
- [SECURITY.md](https://github.com/Bridgeware-Dynamics-Business/Vibebar/blob/main/.github/SECURITY.md)
