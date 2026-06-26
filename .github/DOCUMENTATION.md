# Making the docs visible to users

The live docs URL:

**https://bridgeware-dynamics-business.github.io/Vibebar/**

## One-time GitHub repo setup (maintainers)

Do these in the GitHub web UI so visitors find the site immediately.

### 1. Set the Website link (shows on repo home)

1. Open the [Vibebar repo](https://github.com/Bridgeware-Dynamics-Business/Vibebar).
2. Click the **gear icon** next to **About** (top right of the repo description).
3. Set **Website** to `https://bridgeware-dynamics-business.github.io/Vibebar/`
4. Save.

GitHub will show a clickable docs link on the repo homepage for every visitor.

### 2. Turn off the empty Wiki tab (recommended)

1. **Settings → General → Features**
2. Uncheck **Wikis**
3. Save.

The `wiki/` folder in git is legacy markdown only. The real site is `docs/` on GitHub Pages. An empty Wiki tab confuses people.

### 3. Confirm Pages is publishing

1. **Settings → Pages**
2. **Source** must be **GitHub Actions**
3. **Actions → Deploy wiki** should be green on `main`

## Where users are linked today

| Location | Points to docs |
|----------|----------------|
| README badges and Documentation section | Yes |
| `package.json` `homepage` | Yes |
| CONTRIBUTING.md header | Yes |
| New issue chooser → Read the documentation | Yes |
| Bug report template → Troubleshooting | Yes |
| Docs site nav + footer | Yes |

## Release notes template

When you publish a release, include:

```markdown
## Documentation
https://bridgeware-dynamics-business.github.io/Vibebar/guide/getting-started

## Version
v1.1.0 (see CHANGELOG.md)
```

See **[VERSIONING.md](../VERSIONING.md)** for the full release checklist (bump all `package.json` files, refresh lockfile, update CHANGELOG, tag `vX.Y.Z`, attach installers).

## Edit and redeploy docs

```bash
npm run docs:dev    # preview locally
# edit files under docs/
git push origin main   # Deploy wiki workflow republishes automatically
```
