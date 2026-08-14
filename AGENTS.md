# AGENTS.md

CommonJS CLI over sharp. No build step — `src/` is what runs.

```bash
npm test
```

- **Formats live only in `src/formats.js`.** Validation, glob, extensions and
  the sharp call all derive from `FORMATS`. Adding a format is one entry there.
- **Nothing outside `src/cli/` prints or exits.** The core throws `UserError`
  and returns data. No `console.log` or `chalk` in it.
- **Tests use real images, no mocks.** No test framework — don't add one.
- **`chalk` is pinned at v4** — v5 is ESM-only.
- **Don't commit or push unless asked.** Branch off `main`.

## Ship

Branch, commit, push to `origin` (`rubel-hs`; never `upstream`), open a PR:

```bash
git checkout -b feat/thing && git push -u origin feat/thing
gh pr create --fill
```

After it merges, release from `main`. `npm version` writes package.json, commits
and tags in one step, so bump nothing by hand:

```bash
git checkout main && git pull
npm test && npm pack --dry-run     # check the tarball has no test/ or dev files
npm version patch                  # or minor / major
git push --follow-tags
npm publish                        # needs npm login manual step
```
