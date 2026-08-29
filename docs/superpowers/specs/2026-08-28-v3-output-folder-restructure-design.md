# v3.0.0 — Non-destructive output folder + core restructure

**Date:** 2026-08-28
**Status:** Approved design, pending implementation plan

## Goal

Two changes shipping together as a breaking 3.0.0 release:

1. **Non-destructive by default.** `oi` never modifies files in the source
   folder unless `--in-place` is passed. Optimized images go to a sibling
   folder named `<input>-oi-out`, or to a custom folder via `-o`.
2. **Readability restructure.** Core reshaped around pipeline stages
   (discover → plan → encode → report), narrative comments trimmed to short
   factual notes, dense logic rewritten plainly, `glob` and `chalk`
   dependencies dropped.

## CLI contract

### Default behavior

```
oi ./images              → writes ./images-oi-out/, subfolders mirrored
oi ./pics/photo.jpg      → writes ./pics-oi-out/photo.jpg
```

The output folder for a single-file input is derived from the file's parent
directory — the same result as a folder run restricted to that one file.

### Flags

| Flag | Behavior |
|------|----------|
| `-q, --quality <1-100>` | unchanged |
| `-f, --format <fmt>` | unchanged |
| `-s, --size <WxH>` | unchanged |
| `-j, --concurrency <n>` | unchanged |
| `-o, --output <dir>` | **new** — custom output folder instead of the sibling `-oi-out` |
| `--in-place` | **new** — pre-3.0 behavior: overwrite sources in the source folder |
| `-h, --help` | unchanged |

`-d, --delete-original` is **removed**. Using it produces the unknown-flag
error plus a hint: originals are kept by default; use `--in-place` to
overwrite them.

### Rules

- `--in-place` combined with `-o` is an error (contradiction).
- An existing output folder is reused; files inside are overwritten silently
  (a rerun is a refresh).
- Discovery skips any directory named `*-oi-out`, so a rerun on a parent
  folder never re-processes its own output.
- Out-folder mode, keeping format, when the encode comes back **larger** than
  the source: the original is copied into the output folder instead, so the
  output folder remains a complete drop-in mirror. Counted separately in the
  summary as `copied`.
- In-place mode keeps the current guard: a larger result leaves the source
  untouched (`kept`).
- Exit codes, progress bar, and summary format stay as they are; the summary
  gains an output-folder line and a `copied` count, and loses `deleted`.

## Module layout

```
src/
  index.js        public API surface only (re-exports)
  formats.js      format table: extensions, encoders, animation — no path policy
  errors.js       UserError (renamed from user-error.js)
  discover.js     find image files (renamed from find-image-files.js); skips *-oi-out dirs
  plan.js         NEW — all output-location logic: mode resolution
                  (sibling / custom dir / in-place), source → job mapping,
                  collision detection
  encode.js       one job in, {originalSize, newSize, action} out
                  (from optimize-image.js)
  run.js          orchestrator: plan → pool → summary (from optimize-images.js)
  pool.js         bounded-concurrency runner (renamed from run-pool.js)
  defaults.js     quality/concurrency bounds + DEFAULT_OPTIONS
  cli/
    index.js      wire-up
    args.js       flag parsing (renamed from parse-arguments.js)
    help.js       help text
    reporter.js   output; chalk replaced by util.styleText; format-bytes
                  folded in (its only consumer)
```

Structural moves:

- `resolveOutputPath` leaves `formats.js` and moves into `plan.js`.
  `formats.js` keeps only format knowledge (extensions, encoder calls,
  animation support).
- `planRun` leaves `optimize-images.js` and moves into `plan.js`.
- `format-bytes.js` is deleted as a module (19 lines, single consumer).
- Comments across all files trimmed to short factual notes.

Dependencies after: `sharp`, `cli-progress`. Removed: `glob`
(→ `fs.readdir` with `recursive: true`), `chalk` (→ `util.styleText`).
Engines bump to `>=20.12.0` (for `util.styleText`).

## Plan stage

**Input:** file list, input root, options. **Output:** `{ jobs, skipped }`.

A **job** is `{ source, outputPath, format }`. The encoder never computes
paths.

### Output path resolution

- **Sibling mode (default):** `outputRoot = <inputRoot>-oi-out`; a file
  input uses its parent directory as the root. Job path =
  `outputRoot + relative(inputRoot, source)`, extension swapped when
  converting formats.
- **Custom (`-o dir`):** same mirror rule with the given directory as root.
- **In-place:** output path is the source directory with an extension swap
  on conversion (pre-3.0 behavior).

### Collision rules (one pass over jobs, all modes)

1. Two different sources mapping to the same `outputPath` is a hard error
   before any write ("convert them separately"). This also covers the
   `logo.jpg` + `logo.jpeg → logo.jpg` case in out-folder mode, which is
   simpler than today because the output tree is separate from the inputs.
2. In-place conversion only: a source that already **is** another job's
   output (`logo.webp` present while running `logo.jpg -f webp`) has its own
   job dropped and is counted as `skipped` — same outcome as today's
   `planRun`, expressed as an explicit rule.

### Directory creation

The plan collects the set of needed output directories; the run stage
creates them all (`mkdir -p`) before the pool starts. No per-file mkdir
racing inside the pool.

### Edge cases

- An input path itself ending in `-oi-out` is allowed (output becomes
  `x-oi-out-oi-out`), but discovery inside it still skips nested `*-oi-out`
  directories.
- Symlinked files are followed (unchanged from today).
- A run where every file is skipped reports 0 optimized without erroring.

## Cross-platform (macOS, Linux, Windows)

- All path math via the `path` module (`join`, `relative`, `basename`) — no
  hardcoded separators. Dropping `glob` helps: `fs.readdir({ recursive })`
  returns native paths and extension filtering is done in our code, so there
  are no glob-pattern separator quirks on Windows.
- The `*-oi-out` skip check compares `path.basename` — separator-safe.
- The temp file is written next to the output file (same volume), so
  `fs.rename` never crosses devices on any OS.
- Color output: a small helper wraps `util.styleText` and disables color
  when `process.stdout.isTTY` is false or `NO_COLOR` is set.
- Tests build paths with `path.join` and create fixtures under
  `os.tmpdir()`.
- CI: GitHub Actions matrix (ubuntu, macos, windows) running `npm test`.
- sharp ships prebuilt binaries for all three platforms; no change needed.

## Encode stage

`encode.js` takes a job plus encode settings:

1. Stat the source.
2. Build the sharp pipeline: `autoOrient()`, optional resize
   (`fit: "inside"`, `withoutEnlargement`), `animated` when the target
   format supports it.
3. Write to a temp file beside the output path (random suffix — after
   planning no two jobs share an output path, but the suffix keeps any
   unexpected double-writer from truncating a file mid-run).
4. Stat the result and decide:
   - in-place, keeping format, result larger → delete temp,
     `action: "kept"`;
   - out-folder mode, keeping format, result larger → delete temp, copy the
     source to `outputPath`, `action: "copied"`;
   - otherwise → rename temp to `outputPath`, `action: "written"`.
5. On any failure, delete the temp file and rethrow.

Returns `{ originalSize, newSize, action }`. There is no deletion logic
anywhere — `-d` is gone.

## Public API (breaking)

```js
const { discoverImages, optimizeImages } = require("oi-optimize-images");

const { root, files } = await discoverImages("./images");
const summary = await optimizeImages(files, {
  inputRoot: root,          // required unless inPlace: true (mirroring needs it)
  output: "./optimized",    // or omit → `${inputRoot}-oi-out`
  inPlace: false,           // true = pre-3.0 behavior
  quality: 80,
  format: "webp",
  size: null,
  concurrency: 8,
});
```

- `discoverImages` (renamed from `findImageFiles`) returns `{ root, files }`
  — today the root is lost, and mirroring needs it.
- The summary gains `copied` and `outputDir`, and loses `deleted`.
- Exported constants (quality/concurrency bounds, format names) unchanged.

## Error handling

- `UserError` → friendly message, exit code 1 (unchanged).
- New `UserError`s: `-o` with `--in-place`; output directory path exists but
  is a file; output collision (rule 1).
- A per-file encode failure is reported, the run continues, and the file is
  counted in `failed` (unchanged).

## Testing

Suite stays on `node --test`, reshaped to the new modules:

- `plan.test.js` — the heart of the new logic: sibling/custom/in-place path
  mapping, nested-directory mirroring, extension swap, collision rules 1
  and 2, `*-oi-out` skip, file-input root derivation.
- `encode.test.js` — written/kept/copied actions, temp cleanup on failure,
  orientation, resize.
- `discover.test.js`, `pool.test.js`, `args.test.js`, `run.test.js`,
  `cli.test.js` — updated from the existing suite.
- Fixtures under `os.tmpdir()`, paths via `path.join`.
- New `.github/workflows/test.yml`: matrix of ubuntu/macos/windows on
  Node 20 and 22.

## Docs and release

- README rewritten: non-destructive default front and center, new flags,
  migration notes for `-d` users and for the changed default output
  location.
- CHANGELOG: 3.0.0 entry with a breaking-changes section (default output
  location, `-d` removed, API renames, engines bump).
- package.json: version 3.0.0, engines `>=20.12.0`, dependencies trimmed to
  `sharp` + `cli-progress`.

## Decisions log

| Decision | Choice |
|----------|--------|
| Scope of "cut buzz" | Trim comments, restructure modules, cut deps/flair, simplify clever logic |
| Dependencies | Drop glob + chalk; keep cli-progress and sharp |
| Single-file output location | Parent-named sibling: `./pics/photo.jpg → ./pics-oi-out/photo.jpg` |
| `-d, --delete-original` | Removed entirely |
| Restructure approach | Pipeline-stage layout (discover → plan → encode → report) |
| Version | 3.0.0 (breaking) |
