# Contributing to VibeBar

**Documentation:** [bridgeware-dynamics-business.github.io/Vibebar](https://bridgeware-dynamics-business.github.io/Vibebar/) · [Contributing guide on the docs site](https://bridgeware-dynamics-business.github.io/Vibebar/contribute/contributing)

Thanks for your interest in improving VibeBar! This project welcomes bug
reports, feature ideas, and pull requests. This guide explains how to propose
changes so they can be reviewed and merged smoothly.

## Ground rules

- **Nobody pushes directly to `main`.** All changes land through a pull request
  that a maintainer reviews and merges. This is enforced by branch protection,
  so even maintainers go through review.
- **VibeBar is source-available, not open source.** You're welcome to read the
  code, use it, and contribute improvements back to this project. **Forking the
  repo to prepare and submit pull requests is expressly allowed** under the
  "Contribution Fork Permission" in the [LICENSE](LICENSE). What you may **not**
  do is distribute it, sell it, or ship your fork as a standalone or competing
  product without prior written permission from the maintainer. See
  [LICENSE](LICENSE) for the binding terms.
- **Improvements belong to the main application.** The goal is to make VibeBar
  itself better, not to spin off separate releases. Please send your work here
  as a pull request rather than publishing a derivative.
- Be respectful. By participating you agree to abide by our
  [Code of Conduct](CODE_OF_CONDUCT.md).
- This is a security-focused tool, so we hold contributions to a high bar around
  safety, input validation, and the Electron hardening described in the README.

## Licensing of contributions & the CLA

Contributions are covered by our [Contributor License Agreement](CLA.md).
**You keep the copyright to your own work** — the CLA simply grants the project
permission to use, ship, and license your contribution as part of VibeBar.

There's nothing to sign separately: **by opening a pull request, you agree to
the CLA.** It applies once and covers all your future contributions. The PR
template includes a short line acknowledging this.

If you want permission to sell or distribute VibeBar, or to discuss commercial
licensing, contact the maintainer through the repository before doing so.

## Ways to contribute

- **Report a bug** — open a [bug report issue](../../issues/new/choose).
- **Suggest a feature** — open a [feature request issue](../../issues/new/choose)
  so we can discuss it before you spend time building.
- **Submit code** — fork the repo and open a pull request (see below).

## Development setup

You'll need **Node.js 20 or newer** (the maintainer develops on Node 22) and,
for the full overlay/packaging experience, **Windows 10 or 11**.

```bash
# 1. Fork the repo on GitHub, then clone YOUR fork
git clone https://github.com/<your-username>/Vibebar.git
cd Vibebar

# 2. Point "upstream" at the original repo so you can stay in sync
git remote add upstream https://github.com/Bridgeware-Dynamics-Business/Vibebar.git

# 3. Install all workspaces
npm install

# 4. Run the app in development
npm run dev
```

Useful scripts (run from the repo root):

```bash
npm run dev         # launch VibeBar in development (electron-vite)
npm test            # run the full unit-test suite (Vitest)
npm run typecheck   # TypeScript type-check with no emit
npm run build       # production bundle
npm run dist        # build an unsigned Windows installer + portable exe
```

## The pull request workflow

1. **Sync your fork** with the latest `main`:

   ```bash
   git fetch upstream
   git checkout main
   git merge upstream/main
   ```

2. **Create a branch** off `main`. Use a short, descriptive name:

   ```bash
   git checkout -b feat/terminal-copy-button
   # or: fix/audit-false-positive, docs/readme-typo, refactor/ipc-validation
   ```

3. **Make your change.** Keep it focused — one logical change per PR is much
   easier to review than a giant mixed bundle.

4. **Verify locally before you push:**

   ```bash
   npm run typecheck   # must pass with no errors
   npm test            # must pass
   npm run build       # must succeed
   ```

5. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/):

   - `feat:` a new feature
   - `fix:` a bug fix
   - `docs:` documentation only
   - `refactor:` code change that neither fixes a bug nor adds a feature
   - `chore:` tooling, build, or maintenance

   ```bash
   git commit -m "feat: add copy button to smart terminal dock"
   ```

6. **Push to your fork** and open a pull request against
   `Bridgeware-Dynamics-Business/Vibebar`'s `main` branch:

   ```bash
   git push -u origin feat/terminal-copy-button
   ```

   GitHub will then show a "Compare & pull request" button.

7. **Fill in the PR template** and make sure CI passes. A maintainer will review,
   may request changes, and will merge once it's approved.

See [VERSIONING.md](VERSIONING.md) for how maintainers cut releases (`1.1.0` → `1.2.0`, etc.).

## What makes a PR easy to accept

- It does one thing and the description explains the "why."
- `typecheck`, `test`, and `build` all pass (CI checks this automatically).
- It uses strict TypeScript — avoid `any` unless there's a documented reason.
- It respects the security model: renderer↔main calls go through the IPC channel
  allowlist with Zod validation, project access stays read-only (except Code
  Sync's explicit mirror destinations), and no secrets are ever committed.
- New user-visible behavior comes with tests where practical.

## Security issues

Please **do not** open a public issue for a security vulnerability. Instead,
report it privately via GitHub's "Report a vulnerability" feature under the
**Security** tab, or contact the maintainer directly. See
[SECURITY.md](.github/SECURITY.md).

## Questions

Not sure about something? Open a [discussion or issue](../../issues) and ask —
it's always fine to check before investing a lot of time.
