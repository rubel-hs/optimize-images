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
- **Nothing assumes this machine.** Worker counts, caps and test thresholds come
  from `os.availableParallelism()` at runtime, never a number copied off the dev
  box. Check a change under `taskset -c 0` and `taskset -c 0,1` before calling
  it green.
- **`chalk` is pinned at v4** — v5 is ESM-only.
- **Don't commit or push unless asked.** Branch off `main`.

## Ship

Branch, commit, push to `origin` (`rubel-hs`; never `upstream`), open a PR:

```bash
git checkout -b feat/thing && git push -u origin feat/thing
gh pr create --fill
```

A PR that changes anything a user can see carries its own `CHANGELOG.md` entry
and version bump, so `main` is always ready to publish:

```bash
npm version minor --no-git-tag-version   # or patch / major; writes both lockfiles
```

Then write the entry under a heading for that version, and add the compare link
at the bottom of the file. Anything that lands without a release goes under
`[Unreleased]` instead.

After it merges, release from `main`. The version is already correct, so tag
what is there rather than bumping again:

```bash
git checkout main && git pull
npm test && npm pack --dry-run     # check the tarball has no test/ or dev files
git tag "v$(node -p "require('./package.json').version")"
git push --follow-tags
npm publish                        # needs npm login manual step
```
