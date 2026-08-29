# v3.0.0 Non-Destructive Output + Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v3.0.0: `oi` never modifies source images by default (output goes to a `<input>-oi-out` sibling folder, `-o <dir>` for a custom folder, `--in-place` for the old behavior), with the core restructured into pipeline stages (discover → plan → encode → run) and the `glob` + `chalk` dependencies dropped.

**Architecture:** Output-location policy is centralized in a new `src/plan.js`, which turns discovered files into jobs `{ source, outputPath, format, whenLarger }`. The encoder (`src/encode.js`) never computes paths — it encodes one job and obeys its `whenLarger` policy. `src/run.js` orchestrates: plan → create output dirs → pool → summary. The CLI is a thin consumer.

**Tech Stack:** Node.js ≥ 20.12 (CommonJS), sharp, cli-progress, `node --test` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-08-28-v3-output-folder-restructure-design.md`

## Global Constraints

- Node engines: `>=20.12.0` (needed for `util.styleText` and `Dirent.parentPath`).
- Dependencies after this plan: `sharp`, `cli-progress` only. `glob` and `chalk` are removed.
- The `-d, --delete-original` flag is removed; no deletion logic anywhere in the codebase.
- Output folder suffix is exactly `-oi-out`.
- All path math via the `path` module — no hardcoded `/` or `\` in src or tests. Tests build paths with `path.join` and use `os.tmpdir()` fixtures (via `test/helpers/fixtures.js`).
- Comments: short factual notes only. No multi-paragraph narrative blocks.
- Every task ends with `npm test` fully green and a commit.
- Test command: `npm test` (runs `node --test test/*.test.js`). Single file: `node --test test/<file>.test.js`.

---

### Task 1: Rename `user-error.js` → `errors.js` and `run-pool.js` → `pool.js`

Mechanical renames so later tasks can reference the final module names.

**Files:**
- Rename: `src/user-error.js` → `src/errors.js`
- Rename: `src/run-pool.js` → `src/pool.js`
- Rename: `test/run-pool.test.js` → `test/pool.test.js`
- Modify: every file that requires the old paths: `src/index.js`, `src/optimize-images.js`, `src/find-image-files.js`, `src/cli/index.js`, `src/cli/parse-arguments.js`, `test/pool.test.js`, plus any test requiring `user-error`

**Interfaces:**
- Produces: `require("../src/errors")` → `{ UserError }`; `require("../src/pool")` → `{ runPool }`. Signatures unchanged.

- [ ] **Step 1: Rename the files with git**

```bash
git mv src/user-error.js src/errors.js
git mv src/run-pool.js src/pool.js
git mv test/run-pool.test.js test/pool.test.js
```

- [ ] **Step 2: Update every require**

Find them:

```bash
grep -rn "user-error\|run-pool" src test
```

Replace `require("./user-error")` → `require("./errors")`, `require("../user-error")` → `require("../errors")`, `require("./run-pool")` → `require("./pool")`, `require("../src/run-pool")` → `require("../src/pool")` in each hit. Content of the two renamed source files stays byte-identical.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS, same count as before the rename.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: rename user-error.js to errors.js and run-pool.js to pool.js"
```

---

### Task 2: Add `outputExtensionFor` to `formats.js`

The planner (Task 4) swaps extensions itself; it needs the format table to expose the output extension. `resolveOutputPath` stays in `formats.js` for now — the old pipeline still uses it; it is deleted in Task 8.

**Files:**
- Modify: `src/formats.js`
- Test: `test/formats.test.js`

**Interfaces:**
- Produces: `outputExtensionFor(format: string) → string` — e.g. `outputExtensionFor("jpg") === ".jpg"`. Exported from `src/formats.js`.

- [ ] **Step 1: Write the failing test**

Append to `test/formats.test.js` (match the file's existing `test(...)` style and requires; add `outputExtensionFor` to the require from `../src/formats`):

```js
test("outputExtensionFor returns the canonical extension for a format", () => {
  assert.equal(outputExtensionFor("jpg"), ".jpg");
  assert.equal(outputExtensionFor("tiff"), ".tiff");
  assert.equal(outputExtensionFor("webp"), ".webp");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/formats.test.js`
Expected: FAIL — `outputExtensionFor is not a function`.

- [ ] **Step 3: Implement**

In `src/formats.js`, below `supportsAnimation`:

```js
/** The extension a format writes, e.g. "jpg" -> ".jpg". */
function outputExtensionFor(format) {
  return FORMATS[format].outputExtension;
}
```

Add `outputExtensionFor` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/formats.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/formats.js test/formats.test.js
git commit -m "feat: expose outputExtensionFor from the format table"
```

---

### Task 3: New `src/discover.js` (replaces glob-based discovery)

New module built alongside the old one. `find-image-files.js` keeps working untouched until Task 8 deletes it.

**Files:**
- Create: `src/discover.js`
- Test: `test/discover.test.js`

**Interfaces:**
- Consumes: `isSupportedImage` from `src/formats.js`, `UserError` from `src/errors.js`.
- Produces: `discoverImages(inputPath: string) → Promise<{ root: string, files: string[] }>`. `root` is the resolved directory (a file input's parent directory). `files` are absolute, sorted. Directories whose name ends in `-oi-out` are skipped during the walk (the input directory itself is exempt). Throws `UserError` for: missing path, unsupported single file, no images found, path that is neither file nor directory.

- [ ] **Step 1: Write the failing tests**

Create `test/discover.test.js`:

```js
"use strict";

const assert = require("node:assert/strict");
const path = require("path");
const test = require("node:test");

const { discoverImages } = require("../src/discover");
const { UserError } = require("../src/errors");
const {
  cleanupFixtures,
  createTempDir,
  writeImage,
} = require("./helpers/fixtures");

test.after(cleanupFixtures);

test("returns the resolved directory as root with every nested image", async () => {
  const dir = createTempDir();
  await writeImage(dir, "a.jpg");
  await writeImage(dir, path.join("nested", "b.png"));

  const { root, files } = await discoverImages(dir);

  assert.equal(root, path.resolve(dir));
  assert.deepEqual(
    files.map((file) => path.relative(root, file)).sort(),
    ["a.jpg", path.join("nested", "b.png")],
  );
});

test("a single file input uses its parent directory as root", async () => {
  const dir = createTempDir();
  const file = await writeImage(dir, "photo.jpg");

  const { root, files } = await discoverImages(file);

  assert.equal(root, path.resolve(dir));
  assert.deepEqual(files, [path.resolve(file)]);
});

test("skips directories named *-oi-out", async () => {
  const dir = createTempDir();
  await writeImage(dir, "a.jpg");
  await writeImage(dir, path.join("images-oi-out", "old.jpg"));
  await writeImage(dir, path.join("deep", "x-oi-out", "older.jpg"));

  const { files } = await discoverImages(dir);

  assert.deepEqual(files.map((file) => path.basename(file)), ["a.jpg"]);
});

test("an input directory itself named *-oi-out is still walked", async () => {
  const parent = createTempDir();
  const dir = path.join(parent, "images-oi-out");
  await writeImage(dir, "a.jpg");

  const { files } = await discoverImages(dir);

  assert.equal(files.length, 1);
});

test("matches extensions case-insensitively", async () => {
  const dir = createTempDir();
  await writeImage(dir, "UPPER.JPG");

  const { files } = await discoverImages(dir);

  assert.deepEqual(files.map((file) => path.basename(file)), ["UPPER.JPG"]);
});

test("ignores unsupported files inside a directory", async () => {
  const dir = createTempDir();
  await writeImage(dir, "a.jpg");
  require("fs").writeFileSync(path.join(dir, "notes.txt"), "not an image");

  const { files } = await discoverImages(dir);

  assert.equal(files.length, 1);
});

test("rejects an unsupported single file", async () => {
  const dir = createTempDir();
  const file = path.join(dir, "notes.txt");
  require("fs").writeFileSync(file, "not an image");

  await assert.rejects(discoverImages(file), UserError);
});

test("rejects a path that does not exist", async () => {
  const dir = createTempDir();
  await assert.rejects(discoverImages(path.join(dir, "missing")), UserError);
});

test("rejects a directory with no images", async () => {
  const dir = createTempDir();
  await assert.rejects(discoverImages(dir), UserError);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/discover.test.js`
Expected: FAIL — `Cannot find module '../src/discover'`.

- [ ] **Step 3: Implement `src/discover.js`**

```js
"use strict";

const fs = require("fs/promises");
const path = require("path");

const { isSupportedImage } = require("./formats");
const { UserError } = require("./errors");

const OUTPUT_DIR_SUFFIX = "-oi-out";

/** True when any parent segment of the relative path is an oi output folder. */
function insideOutputDir(relativePath) {
  return relativePath
    .split(path.sep)
    .slice(0, -1)
    .some((segment) => segment.endsWith(OUTPUT_DIR_SUFFIX));
}

/**
 * Expand a file or directory path into { root, files }: the folder the run is
 * rooted at and the absolute path of every image to process, sorted.
 *
 * Previous runs' output folders (*-oi-out) are skipped, so re-running on a
 * parent never re-processes its own output.
 */
async function discoverImages(inputPath) {
  const target = path.resolve(inputPath);

  let stats;
  try {
    stats = await fs.stat(target);
  } catch {
    throw new UserError(`Path does not exist: ${target}`);
  }

  if (stats.isFile()) {
    if (!isSupportedImage(target)) {
      throw new UserError(
        `Unsupported file type: ${path.extname(target).toLowerCase()}`,
      );
    }
    return { root: path.dirname(target), files: [target] };
  }

  if (!stats.isDirectory()) {
    throw new UserError("Path must be a file or directory.");
  }

  const entries = await fs.readdir(target, {
    recursive: true,
    withFileTypes: true,
  });

  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter(isSupportedImage)
    .filter((file) => !insideOutputDir(path.relative(target, file)))
    .sort();

  if (files.length === 0) {
    throw new UserError(`No supported images found in: ${target}`);
  }

  return { root: target, files };
}

module.exports = { OUTPUT_DIR_SUFFIX, discoverImages };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/discover.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — old pipeline untouched.

- [ ] **Step 6: Commit**

```bash
git add src/discover.js test/discover.test.js
git commit -m "feat: add discover module returning root plus files, skipping -oi-out folders"
```

---

### Task 4: New `src/plan.js` — output-location policy and collision rules

Pure path logic, no filesystem access — tests need no fixtures.

**Files:**
- Create: `src/plan.js`
- Test: `test/plan.test.js`

**Interfaces:**
- Consumes: `KEEP_ORIGINAL_FORMAT`, `outputExtensionFor`, `resolveOutputFormat` from `src/formats.js`; `UserError` from `src/errors.js`; `OUTPUT_DIR_SUFFIX` from `src/discover.js`.
- Produces:
  - `resolveOutputRoot(inputRoot: string|null, { output?: string|null, inPlace?: boolean }) → string|null` — `null` when in-place, else the resolved `-o` dir, else `path.resolve(inputRoot) + "-oi-out"`.
  - `planJobs(files: string[], options) → { jobs, skipped, outputDirs, outputRoot }` where `options` includes `{ inputRoot, output, inPlace, format, size }`. A job is `{ source: string, outputPath: string, format: string, whenLarger: "write"|"keep"|"copy" }` with `source` resolved. `skipped` counts duplicate inputs and in-place sources dropped by collision rule 2. `outputDirs` is the deduplicated list of directories the run must create (empty when in-place). Throws `UserError` on collision rule 1.

- [ ] **Step 1: Write the failing tests**

Create `test/plan.test.js`:

```js
"use strict";

const assert = require("node:assert/strict");
const path = require("path");
const test = require("node:test");

const { planJobs, resolveOutputRoot } = require("../src/plan");
const { UserError } = require("../src/errors");

const ROOT = path.resolve(path.join("project", "images"));
const OUT = `${ROOT}-oi-out`;
const inRoot = (...parts) => path.join(ROOT, ...parts);

const defaults = { inputRoot: ROOT, output: null, inPlace: false, format: "original", size: null };

test("resolveOutputRoot: sibling by default, custom with output, null in place", () => {
  assert.equal(resolveOutputRoot(ROOT, {}), OUT);
  assert.equal(
    resolveOutputRoot(ROOT, { output: path.join("custom", "dir") }),
    path.resolve(path.join("custom", "dir")),
  );
  assert.equal(resolveOutputRoot(ROOT, { inPlace: true }), null);
});

test("default mode mirrors the tree into the sibling folder", () => {
  const files = [inRoot("a.jpg"), inRoot("nested", "b.png")];
  const { jobs, outputRoot, outputDirs } = planJobs(files, defaults);

  assert.equal(outputRoot, OUT);
  assert.deepEqual(
    jobs.map((job) => job.outputPath),
    [path.join(OUT, "a.jpg"), path.join(OUT, "nested", "b.png")],
  );
  assert.deepEqual(outputDirs.sort(), [OUT, path.join(OUT, "nested")].sort());
});

test("keep-format out-of-place jobs copy the original when larger", () => {
  const { jobs } = planJobs([inRoot("a.jpg")], defaults);
  assert.equal(jobs[0].whenLarger, "copy");
  assert.equal(jobs[0].format, "jpg");
});

test("conversion out-of-place swaps the extension and always writes", () => {
  const { jobs } = planJobs([inRoot("a.jpg")], { ...defaults, format: "webp" });
  assert.equal(jobs[0].outputPath, path.join(OUT, "a.webp"));
  assert.equal(jobs[0].whenLarger, "write");
});

test("explicit same format still copies when larger", () => {
  const { jobs } = planJobs([inRoot("a.jpg")], { ...defaults, format: "jpg" });
  assert.equal(jobs[0].whenLarger, "copy");
});

test("a size request always writes, even when larger", () => {
  const { jobs } = planJobs([inRoot("a.jpg")], {
    ...defaults,
    size: { width: 100, height: 100 },
  });
  assert.equal(jobs[0].whenLarger, "write");
});

test("custom output dir is used as the mirror root", () => {
  const custom = path.resolve("optimized");
  const { jobs, outputRoot } = planJobs([inRoot("nested", "b.png")], {
    ...defaults,
    output: "optimized",
  });
  assert.equal(outputRoot, custom);
  assert.equal(jobs[0].outputPath, path.join(custom, "nested", "b.png"));
});

test("in place, keep format: output is the source and larger results are kept", () => {
  const { jobs, outputRoot, outputDirs } = planJobs([inRoot("a.jpg")], {
    ...defaults,
    inPlace: true,
  });
  assert.equal(outputRoot, null);
  assert.deepEqual(outputDirs, []);
  assert.equal(jobs[0].outputPath, inRoot("a.jpg"));
  assert.equal(jobs[0].whenLarger, "keep");
});

test("in place, converting: extension swaps in the source directory", () => {
  const { jobs } = planJobs([inRoot("a.jpg")], {
    ...defaults,
    inPlace: true,
    format: "webp",
  });
  assert.equal(jobs[0].outputPath, inRoot("a.webp"));
  assert.equal(jobs[0].whenLarger, "write");
});

test("collision rule 1: two sources converting to one output is an error", () => {
  assert.throws(
    () =>
      planJobs([inRoot("logo.jpg"), inRoot("logo.jpeg")], {
        ...defaults,
        format: "jpg",
      }),
    UserError,
  );
});

test("collision rule 2: in-place source that is another job's output is skipped", () => {
  const { jobs, skipped } = planJobs([inRoot("logo.jpg"), inRoot("logo.webp")], {
    ...defaults,
    inPlace: true,
    format: "webp",
  });
  assert.equal(skipped, 1);
  assert.deepEqual(
    jobs.map((job) => job.source),
    [inRoot("logo.jpg")],
  );
});

test("duplicate inputs are planned once and counted as skipped", () => {
  const { jobs, skipped } = planJobs([inRoot("a.jpg"), inRoot("a.jpg")], defaults);
  assert.equal(jobs.length, 1);
  assert.equal(skipped, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/plan.test.js`
Expected: FAIL — `Cannot find module '../src/plan'`.

- [ ] **Step 3: Implement `src/plan.js`**

```js
"use strict";

const path = require("path");

const { OUTPUT_DIR_SUFFIX } = require("./discover");
const { UserError } = require("./errors");
const {
  KEEP_ORIGINAL_FORMAT,
  outputExtensionFor,
  resolveOutputFormat,
} = require("./formats");

/** Where a run writes: null in place, else the -o dir, else the -oi-out sibling. */
function resolveOutputRoot(inputRoot, { output = null, inPlace = false } = {}) {
  if (inPlace) return null;
  if (output) return path.resolve(output);
  return `${path.resolve(inputRoot)}${OUTPUT_DIR_SUFFIX}`;
}

function swapExtension(filePath, format) {
  const base = path.basename(filePath, path.extname(filePath));
  return path.join(path.dirname(filePath), `${base}${outputExtensionFor(format)}`);
}

function outputPathFor(source, outputFormat, requestedFormat, inputRoot, outputRoot) {
  const location = outputRoot
    ? path.join(outputRoot, path.relative(inputRoot, source))
    : source;
  return requestedFormat === KEEP_ORIGINAL_FORMAT
    ? location
    : swapExtension(location, outputFormat);
}

/**
 * What to do when the encode comes back no smaller than the source:
 * overwrite-in-place keeps the source, an out-of-place same-format job copies
 * the source (the output folder stays a complete mirror), and a conversion or
 * resize writes regardless — the caller asked for that format or size.
 */
function whenLargerAction(source, outputPath, outputFormat, { inPlace, size }) {
  if (size) return "write";
  if (inPlace) return source === outputPath ? "keep" : "write";
  const sameFormat = resolveOutputFormat(source, KEEP_ORIGINAL_FORMAT) === outputFormat;
  return sameFormat ? "copy" : "write";
}

/**
 * Turn discovered files into encode jobs with the output path decided.
 *
 * Collision rules, checked before any write:
 * 1. Two different sources mapping to one output path is an error.
 * 2. A source that already IS another job's output (in-place conversion with
 *    the converted file present) has its own job dropped and counted skipped.
 */
function planJobs(files, options) {
  const { inputRoot, format, inPlace, size } = options;
  const outputRoot = resolveOutputRoot(inputRoot, options);
  const resolvedRoot = inputRoot ? path.resolve(inputRoot) : null;

  const seen = new Set();
  const jobs = [];
  let skipped = 0;

  for (const file of files) {
    const source = path.resolve(file);
    if (seen.has(source)) {
      skipped++;
      continue;
    }
    seen.add(source);

    const outputFormat = resolveOutputFormat(source, format);
    const outputPath = outputPathFor(source, outputFormat, format, resolvedRoot, outputRoot);

    jobs.push({
      source,
      outputPath,
      format: outputFormat,
      whenLarger: whenLargerAction(source, outputPath, outputFormat, { inPlace, size }),
    });
  }

  const byOutput = new Map();
  for (const job of jobs) {
    const claimants = byOutput.get(job.outputPath) || [];
    claimants.push(job);
    byOutput.set(job.outputPath, claimants);
  }

  const dropped = new Set();
  for (const [outputPath, claimants] of byOutput) {
    if (claimants.length === 1) continue;

    const converting = claimants.filter((job) => job.source !== outputPath);
    if (converting.length > 1) {
      throw new UserError(
        `"${path.basename(converting[0].source)}" and "${path.basename(converting[1].source)}" ` +
          `would both be written to ${outputPath}. Convert them separately.`,
      );
    }

    for (const job of claimants) {
      if (job.source === outputPath) {
        dropped.add(job);
        skipped++;
      }
    }
  }

  const planned = jobs.filter((job) => !dropped.has(job));
  const outputDirs = outputRoot
    ? [...new Set(planned.map((job) => path.dirname(job.outputPath)))]
    : [];

  return { jobs: planned, skipped, outputDirs, outputRoot };
}

module.exports = { planJobs, resolveOutputRoot };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/plan.test.js`
Expected: PASS (12 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/plan.js test/plan.test.js
git commit -m "feat: add plan module owning output locations and collision rules"
```

---

### Task 5: New `src/encode.js` — job executor

Replaces `optimize-image.js`'s role; the old file stays until Task 8.

**Files:**
- Create: `src/encode.js`
- Test: `test/encode.test.js`

**Interfaces:**
- Consumes: a job `{ source, outputPath, format, whenLarger }` from Task 4; `encodeAs`, `supportsAnimation` from `src/formats.js`.
- Produces: `encodeImage(job, { quality, size }) → Promise<{ originalSize: number, newSize: number, action: "written"|"kept"|"copied" }>`. Output directory must already exist (the run stage creates it). Temp file is written beside the output and removed on failure. For `kept`/`copied`, `newSize` equals `originalSize`.

- [ ] **Step 1: Write the failing tests**

Create `test/encode.test.js`:

```js
"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const sharp = require("sharp");

const { encodeImage } = require("../src/encode");
const {
  cleanupFixtures,
  createTempDir,
  sizeOf,
  writeBrokenImage,
  writeImage,
} = require("./helpers/fixtures");

test.after(cleanupFixtures);

function job(source, outputPath, format, whenLarger) {
  return { source, outputPath, format, whenLarger };
}

test("writes an optimized copy without touching the source", async () => {
  const dir = createTempDir();
  const out = createTempDir();
  const source = await writeImage(dir, "a.jpg", { width: 256, height: 256 });
  const before = fs.readFileSync(source);

  const result = await encodeImage(
    job(source, path.join(out, "a.jpg"), "jpg", "copy"),
    { quality: 60, size: null },
  );

  assert.equal(result.action, "written");
  assert.ok(result.newSize < result.originalSize);
  assert.ok(fs.existsSync(path.join(out, "a.jpg")));
  assert.deepEqual(fs.readFileSync(source), before);
});

test("converts to the job's format", async () => {
  const dir = createTempDir();
  const out = createTempDir();
  const source = await writeImage(dir, "a.jpg");

  const result = await encodeImage(
    job(source, path.join(out, "a.webp"), "webp", "write"),
    { quality: 70, size: null },
  );

  assert.equal(result.action, "written");
  const metadata = await sharp(path.join(out, "a.webp")).metadata();
  assert.equal(metadata.format, "webp");
});

test("copies the source when the encode is larger and whenLarger is copy", async () => {
  const dir = createTempDir();
  const out = createTempDir();
  // Encode once at low quality so a q100 re-encode is guaranteed larger.
  const original = await writeImage(dir, "big.jpg", { width: 256, height: 256 });
  await encodeImage(job(original, path.join(dir, "small.jpg"), "jpg", "write"), {
    quality: 40,
    size: null,
  });
  const source = path.join(dir, "small.jpg");

  const result = await encodeImage(
    job(source, path.join(out, "small.jpg"), "jpg", "copy"),
    { quality: 100, size: null },
  );

  assert.equal(result.action, "copied");
  assert.equal(result.newSize, result.originalSize);
  assert.equal(sizeOf(path.join(out, "small.jpg")), sizeOf(source));
});

test("keeps the source when the encode is larger and whenLarger is keep", async () => {
  const dir = createTempDir();
  const original = await writeImage(dir, "big.jpg", { width: 256, height: 256 });
  await encodeImage(job(original, path.join(dir, "small.jpg"), "jpg", "write"), {
    quality: 40,
    size: null,
  });
  const source = path.join(dir, "small.jpg");
  const before = fs.readFileSync(source);

  const result = await encodeImage(job(source, source, "jpg", "keep"), {
    quality: 100,
    size: null,
  });

  assert.equal(result.action, "kept");
  assert.deepEqual(fs.readFileSync(source), before);
});

test("resizes to fit within the requested size", async () => {
  const dir = createTempDir();
  const out = createTempDir();
  const source = await writeImage(dir, "a.jpg", { width: 200, height: 100 });

  await encodeImage(job(source, path.join(out, "a.jpg"), "jpg", "write"), {
    quality: 80,
    size: { width: 50, height: 50 },
  });

  const metadata = await sharp(path.join(out, "a.jpg")).metadata();
  assert.ok(metadata.width <= 50 && metadata.height <= 50);
});

test("cleans up the temp file when encoding fails", async () => {
  const dir = createTempDir();
  const out = createTempDir();
  const source = writeBrokenImage(dir);

  await assert.rejects(
    encodeImage(job(source, path.join(out, "broken.png"), "png", "copy"), {
      quality: 80,
      size: null,
    }),
  );

  assert.deepEqual(
    fs.readdirSync(out).filter((name) => name.includes("oi_tmp")),
    [],
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/encode.test.js`
Expected: FAIL — `Cannot find module '../src/encode'`.

- [ ] **Step 3: Implement `src/encode.js`**

```js
"use strict";

const crypto = require("crypto");
const fs = require("fs/promises");
const sharp = require("sharp");

const { encodeAs, supportsAnimation } = require("./formats");

/** Written first, then renamed, so a cancelled run never truncates an image. */
const TEMP_SUFFIX = ".oi_tmp";

/** Random per call so no two writers ever share a temp path. */
function temporaryPathFor(outputPath) {
  return `${outputPath}.${crypto.randomBytes(6).toString("hex")}${TEMP_SUFFIX}`;
}

/**
 * Encode one planned job. The planner decided the paths and the larger-result
 * policy; this stage only encodes and moves files. All filesystem calls are
 * async — many of these run at once.
 *
 * @returns {Promise<{originalSize: number, newSize: number, action: "written"|"kept"|"copied"}>}
 */
async function encodeImage(job, { quality, size } = {}) {
  const originalSize = (await fs.stat(job.source)).size;

  // Orientation lives in metadata and re-encoding drops it: bake it in.
  let pipeline = sharp(job.source, {
    animated: supportsAnimation(job.format),
  }).autoOrient();

  if (size) {
    pipeline = pipeline.resize(size.width, size.height, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const tempPath = temporaryPathFor(job.outputPath);

  try {
    await encodeAs(pipeline, job.format, quality).toFile(tempPath);
    const newSize = (await fs.stat(tempPath)).size;

    if (newSize >= originalSize && job.whenLarger !== "write") {
      await fs.rm(tempPath, { force: true });
      if (job.whenLarger === "copy") {
        await fs.copyFile(job.source, job.outputPath);
      }
      return {
        originalSize,
        newSize: originalSize,
        action: job.whenLarger === "copy" ? "copied" : "kept",
      };
    }

    await fs.rename(tempPath, job.outputPath);
    return { originalSize, newSize, action: "written" };
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
}

module.exports = { encodeImage };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/encode.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/encode.js test/encode.test.js
git commit -m "feat: add encode module executing planned jobs"
```

---

### Task 6: New `src/run.js` orchestrator + new defaults

`run.js` is the new `optimizeImages`. `defaults.js` gains the new options and loses `deleteOriginal` here, because `run.js` needs them.

**Files:**
- Create: `src/run.js`
- Modify: `src/defaults.js`
- Test: `test/run.test.js`
- Possibly modify: `test/parse-arguments.test.js` (see Step 6)

**Interfaces:**
- Consumes: `planJobs` (Task 4), `encodeImage` (Task 5), `runPool` (Task 1), `UserError`, `DEFAULT_OPTIONS`.
- Produces: `optimizeImages(files: string[], options, handlers) → Promise<summary>` exported from `src/run.js`. Options: `{ quality, format, size, concurrency, inPlace, output, inputRoot }` (all defaulted from `DEFAULT_OPTIONS`; `inputRoot` required unless `inPlace`). Handlers: `{ onProgress?(done, total), onFailure?(file, error) }`. Summary: `{ total, optimized, copied, skipped, failed, originalSize, newSize, failures: [{file, message}], outputDir: string|null }`.
- Produces: `DEFAULT_OPTIONS = { quality: 80, format: KEEP_ORIGINAL_FORMAT, size: null, concurrency: DEFAULT_CONCURRENCY, inPlace: false, output: null, inputRoot: null }`.

- [ ] **Step 1: Write the failing tests**

Create `test/run.test.js`:

```js
"use strict";

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");

const { optimizeImages } = require("../src/run");
const { UserError } = require("../src/errors");
const {
  cleanupFixtures,
  createTempDir,
  listFiles,
  writeBrokenImage,
  writeImage,
} = require("./helpers/fixtures");

test.after(cleanupFixtures);

/** Input folder inside a tracked temp dir, so the -oi-out sibling is cleaned up. */
async function inputFolder(images) {
  const parent = createTempDir();
  const input = path.join(parent, "images");
  for (const [name, options] of images) await writeImage(input, name, options);
  return input;
}

function filesIn(input) {
  return listFiles(input).map((rel) => path.join(input, rel));
}

test("default run mirrors into the -oi-out sibling and leaves sources alone", async () => {
  const input = await inputFolder([
    ["a.jpg", { width: 256, height: 256 }],
    [path.join("nested", "b.jpg"), { width: 256, height: 256 }],
  ]);
  const before = filesIn(input).map((file) => fs.readFileSync(file));

  const summary = await optimizeImages(filesIn(input), {
    inputRoot: input,
    quality: 60,
  });

  const outDir = `${input}-oi-out`;
  assert.equal(summary.outputDir, outDir);
  assert.equal(summary.optimized, 2);
  assert.deepEqual(listFiles(outDir), ["a.jpg", path.join("nested", "b.jpg")]);
  assert.deepEqual(
    filesIn(input).map((file) => fs.readFileSync(file)),
    before,
  );
});

test("a custom output folder is honored", async () => {
  const input = await inputFolder([["a.jpg", { width: 256, height: 256 }]]);
  const custom = path.join(createTempDir(), "optimized");

  const summary = await optimizeImages(filesIn(input), {
    inputRoot: input,
    output: custom,
    quality: 60,
  });

  assert.equal(summary.outputDir, path.resolve(custom));
  assert.deepEqual(listFiles(custom), ["a.jpg"]);
});

test("inPlace overwrites sources and creates no sibling folder", async () => {
  const input = await inputFolder([["a.jpg", { width: 256, height: 256 }]]);
  const file = path.join(input, "a.jpg");
  const sizeBefore = fs.statSync(file).size;

  const summary = await optimizeImages([file], { inPlace: true, quality: 60 });

  assert.equal(summary.outputDir, null);
  assert.ok(fs.statSync(file).size < sizeBefore);
  assert.ok(!fs.existsSync(`${input}-oi-out`));
});

test("re-running over its own output copies files that cannot shrink", async () => {
  const input = await inputFolder([["a.jpg", { width: 256, height: 256 }]]);
  await optimizeImages(filesIn(input), { inputRoot: input, quality: 40 });
  const firstOut = `${input}-oi-out`;

  const summary = await optimizeImages(
    listFiles(firstOut).map((rel) => path.join(firstOut, rel)),
    { inputRoot: firstOut, quality: 100 },
  );

  assert.equal(summary.copied, 1);
  assert.equal(summary.optimized, 0);
  assert.deepEqual(listFiles(`${firstOut}-oi-out`), ["a.jpg"]);
});

test("a broken image is reported and the run continues", async () => {
  const input = await inputFolder([["a.jpg", { width: 256, height: 256 }]]);
  writeBrokenImage(input, "broken.png");
  const failures = [];

  const summary = await optimizeImages(filesIn(input), {
    inputRoot: input,
    quality: 60,
  }, {
    onFailure: (file) => failures.push(path.basename(file)),
  });

  assert.equal(summary.failed, 1);
  assert.equal(summary.optimized, 1);
  assert.deepEqual(failures, ["broken.png"]);
  assert.equal(summary.failures[0].file, path.join(input, "broken.png"));
});

test("rejects an output path that exists as a file", async () => {
  const input = await inputFolder([["a.jpg", {}]]);
  const clash = path.join(createTempDir(), "not-a-dir");
  fs.writeFileSync(clash, "occupied");

  await assert.rejects(
    optimizeImages(filesIn(input), { inputRoot: input, output: clash }),
    UserError,
  );
});

test("rejects inPlace combined with output", async () => {
  await assert.rejects(
    optimizeImages([], { inPlace: true, output: "somewhere" }),
    UserError,
  );
});

test("rejects a run without inputRoot unless inPlace", async () => {
  await assert.rejects(optimizeImages([], {}), UserError);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/run.test.js`
Expected: FAIL — `Cannot find module '../src/run'`.

- [ ] **Step 3: Update `src/defaults.js`**

Replace the `DEFAULT_OPTIONS` block:

```js
/** Applied by both the argument parser and the programmatic API. */
const DEFAULT_OPTIONS = {
  quality: 80,
  format: KEEP_ORIGINAL_FORMAT,
  size: null,
  concurrency: DEFAULT_CONCURRENCY,
  inPlace: false,
  output: null,
  inputRoot: null,
};
```

(`deleteOriginal` is gone. Everything else in the file is unchanged.)

- [ ] **Step 4: Implement `src/run.js`**

```js
"use strict";

const fs = require("fs/promises");

const { DEFAULT_OPTIONS } = require("./defaults");
const { encodeImage } = require("./encode");
const { planJobs } = require("./plan");
const { runPool } = require("./pool");
const { UserError } = require("./errors");

const noop = () => {};

async function prepareOutputDirs(outputRoot, outputDirs) {
  let stats = null;
  try {
    stats = await fs.stat(outputRoot);
  } catch {
    // Does not exist yet — mkdir below creates it.
  }
  if (stats && !stats.isDirectory()) {
    throw new UserError(`Output path is not a directory: ${outputRoot}`);
  }
  for (const dir of outputDirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * Optimize every file: plan the jobs, create the output folders, run the
 * encoders through the pool and fold the outcomes into one summary. One broken
 * image is reported through onFailure and skipped rather than aborting.
 */
async function optimizeImages(files, options = {}, handlers = {}) {
  const { onProgress = noop, onFailure = noop } = handlers;
  const merged = { ...DEFAULT_OPTIONS, ...options };

  if (merged.inPlace && merged.output) {
    throw new UserError("--in-place cannot be combined with an output directory.");
  }
  if (!merged.inPlace && !merged.inputRoot) {
    throw new UserError("inputRoot is required unless inPlace is set.");
  }

  const { jobs, skipped, outputDirs, outputRoot } = planJobs(files, merged);

  if (outputRoot) await prepareOutputDirs(outputRoot, outputDirs);

  const summary = {
    total: files.length,
    optimized: 0,
    copied: 0,
    skipped,
    failed: 0,
    originalSize: 0,
    newSize: 0,
    failures: [],
    outputDir: outputRoot,
  };

  let completed = 0;

  const outcomes = await runPool(jobs, merged.concurrency, async (job) => {
    let outcome;
    try {
      outcome = { result: await encodeImage(job, merged) };
    } catch (error) {
      outcome = { error };
      onFailure(job.source, error);
    }
    onProgress(++completed, jobs.length);
    return outcome;
  });

  for (const [index, { result, error }] of outcomes.entries()) {
    if (error) {
      summary.failed++;
      summary.failures.push({ file: jobs[index].source, message: error.message });
      continue;
    }
    if (result.action === "copied") summary.copied++;
    else summary.optimized++;
    summary.originalSize += result.originalSize;
    summary.newSize += result.newSize;
  }

  return summary;
}

module.exports = { optimizeImages };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/run.test.js`
Expected: PASS (8 tests).

- [ ] **Step 6: Run the full suite; patch any old test asserting `deleteOriginal` defaults**

Run: `npm test`

If `test/parse-arguments.test.js`, `test/optimize-image.test.js` or `test/optimize-images.test.js` fail because `DEFAULT_OPTIONS.deleteOriginal` no longer exists (e.g. an assertion on parsed defaults), delete just those assertions or add `deleteOriginal: false` to the expected object inline — these tests are removed entirely in Task 8, so the patch is temporary scaffolding, not design.
Expected after patching: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/run.js src/defaults.js test/run.test.js test
git commit -m "feat: add run orchestrator with non-destructive defaults"
```

---

### Task 7: New CLI argument parser `src/cli/args.js`

New file beside the old `parse-arguments.js` (deleted in Task 8). Adds `-o/--output` and `--in-place`, removes `-d` with a pointed error.

**Files:**
- Create: `src/cli/args.js`
- Test: `test/args.test.js`

**Interfaces:**
- Consumes: `DEFAULT_OPTIONS` and bounds from `src/defaults.js`, `REQUESTABLE_FORMATS`, `normalizeFormatName` from `src/formats.js`, `UserError` from `src/errors.js`.
- Produces: `parseArguments(argv) → { path: string|null, helpRequested: boolean, quality, format, size, concurrency, inPlace, output, inputRoot }`. Throws `UserError` for: unknown flag, removed `-d`/`--delete-original` (message names `--in-place`), missing flag value, out-of-range quality/concurrency, bad size, bad format, more than one path, no path, `--in-place` + `-o`.

- [ ] **Step 1: Write the failing tests**

Create `test/args.test.js`:

```js
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { parseArguments } = require("../src/cli/args");
const { DEFAULT_OPTIONS } = require("../src/defaults");
const { UserError } = require("../src/errors");

const parse = (...args) => parseArguments(["node", "oi", ...args]);

test("a bare path gets the defaults", () => {
  const options = parse("./images");
  assert.equal(options.path, "./images");
  assert.equal(options.helpRequested, false);
  assert.equal(options.quality, DEFAULT_OPTIONS.quality);
  assert.equal(options.format, DEFAULT_OPTIONS.format);
  assert.equal(options.inPlace, false);
  assert.equal(options.output, null);
});

test("no arguments or -h requests help", () => {
  assert.equal(parse().helpRequested, true);
  assert.equal(parse("-h").helpRequested, true);
  assert.equal(parse("./images", "--help").helpRequested, true);
});

test("quality, format, size, concurrency parse as before", () => {
  const options = parse("./images", "-q", "60", "-f", "webp", "-s", "600x300", "-j", "2");
  assert.equal(options.quality, 60);
  assert.equal(options.format, "webp");
  assert.deepEqual(options.size, { width: 600, height: 300 });
  assert.equal(options.concurrency, 2);
});

test("-o and --output set the output directory", () => {
  assert.equal(parse("./images", "-o", "./optimized").output, "./optimized");
  assert.equal(parse("./images", "--output", "out").output, "out");
});

test("--in-place is parsed", () => {
  assert.equal(parse("./images", "--in-place").inPlace, true);
});

test("--in-place with -o is rejected", () => {
  assert.throws(() => parse("./images", "--in-place", "-o", "out"), UserError);
});

test("the removed -d flag explains the new model", () => {
  for (const flag of ["-d", "--delete-original"]) {
    assert.throws(
      () => parse("./images", flag),
      (error) =>
        error instanceof UserError && /--in-place/.test(error.message),
    );
  }
});

test("unknown flags, missing values and bad values are rejected", () => {
  assert.throws(() => parse("./images", "--nope"), UserError);
  assert.throws(() => parse("./images", "-q"), UserError);
  assert.throws(() => parse("./images", "-q", "101"), UserError);
  assert.throws(() => parse("./images", "-j", "0"), UserError);
  assert.throws(() => parse("./images", "-f", "bmp"), UserError);
  assert.throws(() => parse("./images", "-s", "600"), UserError);
});

test("exactly one path is required", () => {
  assert.throws(() => parse("./a", "./b"), UserError);
  assert.throws(() => parse("-q", "50"), UserError);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/args.test.js`
Expected: FAIL — `Cannot find module '../src/cli/args'`.

- [ ] **Step 3: Implement `src/cli/args.js`**

```js
"use strict";

const {
  CONCURRENCY_MAX,
  CONCURRENCY_MIN,
  DEFAULT_OPTIONS,
  QUALITY_MAX,
  QUALITY_MIN,
} = require("../defaults");
const { REQUESTABLE_FORMATS, normalizeFormatName } = require("../formats");
const { UserError } = require("../errors");

const SIZE_PATTERN = /^(\d+)x(\d+)$/i;

/**
 * Each flag reads its own value off the argument list and returns the options
 * it contributes. Adding a flag: one entry here, one line in help.js.
 */
const FLAGS = {
  "-q": readQuality,
  "--quality": readQuality,
  "-f": readFormat,
  "--format": readFormat,
  "-s": readSize,
  "--size": readSize,
  "-j": readConcurrency,
  "--concurrency": readConcurrency,
  "-o": readOutput,
  "--output": readOutput,
  "--in-place": () => ({ inPlace: true }),
};

const HELP_FLAGS = new Set(["-h", "--help"]);

/** Flags that existed before 3.0.0 and deserve a pointed error. */
const REMOVED_FLAGS = new Set(["-d", "--delete-original"]);

function readQuality(next, flag) {
  const quality = parseInt(next(flag), 10);
  if (isNaN(quality) || quality < QUALITY_MIN || quality > QUALITY_MAX) {
    throw new UserError(
      `Quality must be a number between ${QUALITY_MIN}-${QUALITY_MAX}.`,
    );
  }
  return { quality };
}

function readConcurrency(next, flag) {
  const concurrency = parseInt(next(flag), 10);
  if (
    isNaN(concurrency) ||
    concurrency < CONCURRENCY_MIN ||
    concurrency > CONCURRENCY_MAX
  ) {
    throw new UserError(
      `Concurrency must be a number between ${CONCURRENCY_MIN}-${CONCURRENCY_MAX}.`,
    );
  }
  return { concurrency };
}

function readFormat(next, flag) {
  const requested = next(flag);
  const format = normalizeFormatName(requested);
  if (!format) {
    throw new UserError(
      `Unsupported format "${requested}". Valid: ${REQUESTABLE_FORMATS.join(", ")}`,
    );
  }
  return { format };
}

function readSize(next, flag) {
  const match = String(next(flag)).match(SIZE_PATTERN);
  if (!match) {
    throw new UserError("Size must be in WxH format, e.g. 600x300.");
  }
  return {
    size: { width: parseInt(match[1], 10), height: parseInt(match[2], 10) },
  };
}

function readOutput(next, flag) {
  return { output: next(flag) };
}

/**
 * Turn `process.argv` into options.
 *
 * @returns {{helpRequested: boolean, path: string|null, ...DEFAULT_OPTIONS}}
 */
function parseArguments(argv) {
  const args = argv.slice(2);

  if (args.length === 0 || args.some((arg) => HELP_FLAGS.has(arg))) {
    return { ...DEFAULT_OPTIONS, path: null, helpRequested: true };
  }

  const options = { ...DEFAULT_OPTIONS, path: null, helpRequested: false };

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const next = (flag) => {
      const value = args[++index];
      if (value === undefined) throw new UserError(`Missing value for "${flag}".`);
      return value;
    };

    if (FLAGS[arg]) {
      Object.assign(options, FLAGS[arg](next, arg));
    } else if (REMOVED_FLAGS.has(arg)) {
      throw new UserError(
        `"${arg}" was removed: originals are kept by default now. ` +
          `Use --in-place to overwrite them.`,
      );
    } else if (arg.startsWith("-")) {
      throw new UserError(`Unknown flag "${arg}".`);
    } else if (options.path) {
      throw new UserError(`Unexpected argument "${arg}". Only one path allowed.`);
    } else {
      options.path = arg;
    }
  }

  if (!options.path) throw new UserError("No image path provided.");

  if (options.inPlace && options.output) {
    throw new UserError("--in-place cannot be combined with -o/--output.");
  }

  return options;
}

module.exports = { parseArguments };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/args.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cli/args.js test/args.test.js
git commit -m "feat: add CLI parser with -o/--in-place, -d removed with migration hint"
```

---

### Task 8: The swap — rewire CLI, reporter, help, public API; delete the old pipeline

Atomic cut-over. After this task the old modules are gone and every entry point uses the new pipeline.

**Files:**
- Modify: `src/cli/index.js`, `src/cli/reporter.js`, `src/cli/help.js`, `src/index.js`, `src/formats.js`
- Delete: `src/find-image-files.js`, `src/optimize-image.js`, `src/optimize-images.js`, `src/format-bytes.js`, `src/cli/parse-arguments.js`
- Delete tests: `test/find-image-files.test.js`, `test/optimize-image.test.js`, `test/optimize-images.test.js`, `test/format-bytes.test.js`, `test/parse-arguments.test.js`
- Modify tests: `test/formats.test.js`, `test/index.test.js`, `test/cli.test.js`

**Interfaces:**
- Consumes: `discoverImages` (Task 3), `resolveOutputRoot` (Task 4), `optimizeImages` from `src/run.js` (Task 6), `parseArguments` from `src/cli/args.js` (Task 7).
- Produces: public API of the package — `require("oi-optimize-images")` exports exactly `{ CONCURRENCY_MAX, CONCURRENCY_MIN, DEFAULT_OPTIONS, FORMAT_NAMES, KEEP_ORIGINAL_FORMAT, QUALITY_MAX, QUALITY_MIN, REQUESTABLE_FORMATS, UserError, discoverImages, optimizeImages }`. Reporter exports gain `paint` and `formatBytes`; `printRunHeader(targetPath, fileCount, options, outputRoot)` takes a fourth argument.

- [ ] **Step 1: Rewrite `test/cli.test.js` (failing first)**

Replace the file's contents with end-to-end tests of the new behavior (spawning the real binary):

```js
"use strict";

const assert = require("node:assert/strict");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const test = require("node:test");
const { promisify } = require("util");

const run = promisify(execFile);
const BIN = path.resolve(__dirname, "..", "bin", "oi.js");

const {
  cleanupFixtures,
  createTempDir,
  listFiles,
  writeImage,
} = require("./helpers/fixtures");

test.after(cleanupFixtures);

async function inputFolder() {
  const parent = createTempDir();
  const input = path.join(parent, "images");
  await writeImage(input, "a.jpg", { width: 256, height: 256 });
  await writeImage(input, path.join("nested", "b.jpg"), { width: 256, height: 256 });
  return input;
}

function oi(...args) {
  return run(process.execPath, [BIN, ...args]);
}

test("default run writes the -oi-out sibling and leaves sources untouched", async () => {
  const input = await inputFolder();
  const before = fs.readFileSync(path.join(input, "a.jpg"));

  const { stdout } = await oi(input, "-q", "60");

  assert.deepEqual(listFiles(`${input}-oi-out`), ["a.jpg", path.join("nested", "b.jpg")]);
  assert.deepEqual(fs.readFileSync(path.join(input, "a.jpg")), before);
  assert.match(stdout, /-oi-out/);
});

test("-o writes into the given folder", async () => {
  const input = await inputFolder();
  const custom = path.join(createTempDir(), "optimized");

  await oi(input, "-o", custom, "-q", "60");

  assert.deepEqual(listFiles(custom), ["a.jpg", path.join("nested", "b.jpg")]);
});

test("--in-place overwrites the sources", async () => {
  const input = await inputFolder();
  const file = path.join(input, "a.jpg");
  const sizeBefore = fs.statSync(file).size;

  await oi(input, "--in-place", "-q", "60");

  assert.ok(fs.statSync(file).size < sizeBefore);
  assert.ok(!fs.existsSync(`${input}-oi-out`));
});

test("a single file lands in the parent-named sibling", async () => {
  const input = await inputFolder();

  await oi(path.join(input, "a.jpg"), "-q", "60");

  assert.deepEqual(listFiles(`${input}-oi-out`), ["a.jpg"]);
});

test("-d fails with a migration hint and exit code 1", async () => {
  const input = await inputFolder();

  await assert.rejects(oi(input, "-d"), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /--in-place/);
    return true;
  });
});

test("--in-place with -o fails", async () => {
  const input = await inputFolder();

  await assert.rejects(oi(input, "--in-place", "-o", "out"), (error) => {
    assert.equal(error.code, 1);
    return true;
  });
});

test("a missing path fails with exit code 1", async () => {
  await assert.rejects(oi(path.join(createTempDir(), "missing")), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /does not exist/i);
    return true;
  });
});

test("--help prints usage and exits 0", async () => {
  const { stdout } = await oi("--help");
  assert.match(stdout, /--in-place/);
  assert.match(stdout, /-o, --output/);
  assert.doesNotMatch(stdout, /--delete-original/);
});
```

Run: `node --test test/cli.test.js`
Expected: FAIL — old CLI still writes in place / lacks new flags.

- [ ] **Step 2: Rewrite `src/cli/reporter.js`**

```js
"use strict";

const path = require("path");
const { styleText } = require("util");
const cliProgress = require("cli-progress");

const { KEEP_ORIGINAL_FORMAT } = require("../formats");

/** Everything the CLI prints lives here, so the core stays terminal-agnostic. */

/** Color only for real terminals, and never when NO_COLOR is set. */
function paint(styles, text) {
  if (!process.stdout.isTTY || process.env.NO_COLOR) return text;
  return styleText(styles, text);
}

const UNITS = ["B", "KB", "MB", "GB"];

/** 1536 -> "1.5 KB" */
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    UNITS.length - 1,
  );
  return `${parseFloat((bytes / 1024 ** unitIndex).toFixed(1))} ${UNITS[unitIndex]}`;
}

function printError(message) {
  console.error(paint("red", `Error: ${message}`));
}

function printFatal(message) {
  console.error(paint("red", `Fatal: ${message}`));
}

function printRunHeader(targetPath, fileCount, options, outputRoot) {
  console.log();
  console.log(paint(["bold", "cyan"], "  oi — Optimize Images"));
  console.log(paint("dim", "  ─────────────────────"));
  console.log(`  ${paint("dim", "Path:")}     ${targetPath}`);
  console.log(
    `  ${paint("dim", "Output:")}   ${outputRoot || "in place (originals overwritten)"}`,
  );
  console.log(`  ${paint("dim", "Images:")}   ${fileCount}`);
  console.log(`  ${paint("dim", "Quality:")}  ${options.quality}`);
  console.log(
    `  ${paint("dim", "Format:")}   ${options.format}${
      options.format === KEEP_ORIGINAL_FORMAT ? " (keep)" : ""
    }`,
  );
  console.log(`  ${paint("dim", "Workers:")}  ${options.concurrency}`);
  if (options.size) {
    console.log(
      `  ${paint("dim", "Resize:")}   ${options.size.width}×${options.size.height}`,
    );
  }
  console.log();
}

function createProgressBar(total) {
  const bar = new cliProgress.SingleBar(
    {
      format: `  {bar} {percentage}% | {value}/{total} files`,
      barCompleteChar: "█",
      barIncompleteChar: "░",
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic,
  );

  bar.start(total, 0);
  return bar;
}

/** Written to stderr so it survives above the progress bar. */
function printFileFailure(file, error) {
  process.stderr.write(
    paint("dim", `\n  ⚠ ${path.basename(file)}: ${error.message}\n`),
  );
}

function printSummary(summary) {
  const saved = summary.originalSize - summary.newSize;
  const savedPercent =
    summary.originalSize > 0
      ? ((saved / summary.originalSize) * 100).toFixed(1)
      : 0;

  console.log();
  if (summary.failed > 0) {
    console.log(paint("yellow", `  ${summary.failed} file(s) had errors.`));
  }
  console.log(`  ${paint("green", "✓")} ${summary.optimized} image(s) optimized`);
  if (summary.copied > 0) {
    console.log(
      `  ${paint("dim", "Copied as-is:")} ${summary.copied} file(s) were already smaller than a re-encode`,
    );
  }
  if (summary.skipped > 0) {
    console.log(`  ${paint("dim", "Left alone:")} ${summary.skipped} file(s)`);
  }
  if (summary.outputDir) {
    console.log(`  ${paint("dim", "Output:")} ${summary.outputDir}`);
  }
  console.log(
    `  ${paint("dim", "Before:")} ${formatBytes(summary.originalSize)}  →  ${paint("dim", "After:")} ${formatBytes(summary.newSize)}`,
  );

  if (saved > 0) {
    console.log(
      `  ${paint(["bold", "green"], `Saved: ${formatBytes(saved)} (${savedPercent}%)`)}`,
    );
  } else if (saved < 0) {
    console.log(
      `  ${paint("yellow", `Size increased by: ${formatBytes(Math.abs(saved))} (consider lower quality)`)}`,
    );
  } else {
    console.log(`  ${paint("dim", "No size change.")}`);
  }
  console.log();
}

module.exports = {
  createProgressBar,
  formatBytes,
  paint,
  printError,
  printFatal,
  printFileFailure,
  printRunHeader,
  printSummary,
};
```

Note: `printSummary` no longer takes `format` — the "Left alone" line no longer mentions it, and there is no "Deleted" line.

- [ ] **Step 3: Rewrite `src/cli/help.js`**

```js
"use strict";

const { DEFAULT_OPTIONS, QUALITY_MAX, QUALITY_MIN } = require("../defaults");
const { FORMAT_NAMES, KEEP_ORIGINAL_FORMAT } = require("../formats");
const { paint } = require("./reporter");

const listedFormats = [KEEP_ORIGINAL_FORMAT, ...FORMAT_NAMES].join(", ");

function printHelp() {
  console.log(`
${paint(["bold", "cyan"], "oi")} ${paint("dim", "— image optimizer CLI")}

${paint("bold", "Usage:")}
  oi <path> [options]

By default nothing in <path> is modified: optimized images are written to a
sibling folder named <path>-oi-out.

${paint("bold", "Options:")}
  -q, --quality <${QUALITY_MIN}-${QUALITY_MAX}>   Image quality (default: ${DEFAULT_OPTIONS.quality})
  -f, --format <fmt>      Output format: ${listedFormats} (default: ${DEFAULT_OPTIONS.format})
  -s, --size <WxH>        Resize to fit within width x height, e.g. 600x300
  -j, --concurrency <n>   Images to encode at once (default: ${DEFAULT_OPTIONS.concurrency}, one per core)
  -o, --output <dir>      Write optimized images to <dir> instead of the -oi-out sibling
      --in-place          Overwrite the original files where they are
  -h, --help              Show this help

${paint("bold", "Examples:")}
  oi ./images                    Optimize into ./images-oi-out
  oi ./images -o ./optimized     Optimize into ./optimized
  oi ./images --in-place         Overwrite the files in ./images
  oi ./images -f webp            Convert everything to WebP, into ./images-oi-out
  oi ./photo.jpg                 Optimize one file into the parent's -oi-out sibling
`);
}

module.exports = { printHelp };
```

- [ ] **Step 4: Rewrite `src/cli/index.js`**

```js
"use strict";

const path = require("path");

const { discoverImages } = require("../discover");
const { optimizeImages } = require("../run");
const { resolveOutputRoot } = require("../plan");
const { UserError } = require("../errors");
const { parseArguments } = require("./args");
const { printHelp } = require("./help");
const {
  createProgressBar,
  printError,
  printFatal,
  printFileFailure,
  printRunHeader,
  printSummary,
} = require("./reporter");

const EXIT_FAILURE = 1;

async function runCli(argv) {
  try {
    const { path: inputPath, helpRequested, ...options } = parseArguments(argv);

    if (helpRequested) {
      printHelp();
      return;
    }

    const { root, files } = await discoverImages(inputPath);
    const outputRoot = resolveOutputRoot(root, options);

    printRunHeader(path.resolve(inputPath), files.length, options, outputRoot);

    const bar = createProgressBar(files.length);
    const summary = await optimizeImages(files, { ...options, inputRoot: root }, {
      onProgress: (done, total) => {
        // Planning can drop files, so the bar can have fewer steps than found.
        bar.setTotal(total);
        bar.update(done);
      },
      onFailure: printFileFailure,
    });
    bar.stop();

    printSummary(summary);
  } catch (error) {
    if (error instanceof UserError) {
      printError(error.message);
    } else {
      printFatal(error.message);
    }
    process.exitCode = EXIT_FAILURE;
  }
}

module.exports = { runCli };
```

- [ ] **Step 5: Rewrite `src/index.js`**

```js
"use strict";

/**
 * Public entry point.
 *
 *   const { discoverImages, optimizeImages } = require("oi-optimize-images");
 *
 *   const { root, files } = await discoverImages("./images");
 *   const summary = await optimizeImages(files, { inputRoot: root, quality: 70 });
 *
 * By default nothing under inputRoot is modified — output goes to the
 * `${inputRoot}-oi-out` sibling (or `output`); pass `inPlace: true` to
 * overwrite sources. The CLI in `src/cli/` is one consumer of this API.
 */

const {
  CONCURRENCY_MAX,
  CONCURRENCY_MIN,
  DEFAULT_OPTIONS,
  QUALITY_MAX,
  QUALITY_MIN,
} = require("./defaults");
const { discoverImages } = require("./discover");
const {
  FORMAT_NAMES,
  KEEP_ORIGINAL_FORMAT,
  REQUESTABLE_FORMATS,
} = require("./formats");
const { optimizeImages } = require("./run");
const { UserError } = require("./errors");

module.exports = {
  CONCURRENCY_MAX,
  CONCURRENCY_MIN,
  DEFAULT_OPTIONS,
  FORMAT_NAMES,
  KEEP_ORIGINAL_FORMAT,
  QUALITY_MAX,
  QUALITY_MIN,
  REQUESTABLE_FORMATS,
  UserError,
  discoverImages,
  optimizeImages,
};
```

- [ ] **Step 6: Trim `src/formats.js` and delete the dead modules**

In `src/formats.js`: delete `resolveOutputPath`, `IMAGE_GLOB_PATTERN`, and the `INPUT_EXTENSIONS`-based glob constant if nothing else uses it (keep `FORMAT_BY_INPUT_EXTENSION`; keep `INPUT_EXTENSIONS` only if still referenced — check with `grep -rn "INPUT_EXTENSIONS\|IMAGE_GLOB_PATTERN\|resolveOutputPath" src test`). Remove both from `module.exports`.

Delete the replaced modules and their tests:

```bash
git rm src/find-image-files.js src/optimize-image.js src/optimize-images.js src/format-bytes.js src/cli/parse-arguments.js
git rm test/find-image-files.test.js test/optimize-image.test.js test/optimize-images.test.js test/format-bytes.test.js test/parse-arguments.test.js
```

- [ ] **Step 7: Update `test/formats.test.js` and `test/index.test.js`**

- `test/formats.test.js`: delete the test cases covering `resolveOutputPath` and `IMAGE_GLOB_PATTERN`, and remove those names from the require. Everything else stays.
- `test/index.test.js`: update the expected export list to exactly the Step 5 export object's keys (add `discoverImages`; remove `findImageFiles`, `formatBytes`, `optimizeImage`).

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS — including the Step 1 CLI tests. Also verify no stragglers:

```bash
grep -rn "find-image-files\|optimize-image\b\|optimize-images\b\|format-bytes\|parse-arguments\|chalk\|glob" src bin test --include="*.js" -l
```

Expected: no hits in `src` or `bin` for the deleted module names, `chalk`, or `glob` (test helper files must not reference them either).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat!: non-destructive default output to -oi-out sibling, in-place behind a flag"
```

---

### Task 9: Readability sweep — trim narrative comments

The new modules were written terse. This pass trims what remains.

**Files:**
- Modify: `src/formats.js`, `src/defaults.js`, `src/pool.js`, `src/errors.js`, `src/cli/tune-runtime.js`

**Interfaces:** none — comment-only changes; `npm test` proves no behavior moved.

- [ ] **Step 1: Trim each file's comments**

Rules: keep a comment only if it states a constraint the code cannot show; one to three lines each; delete history, storytelling, and restatements. Concretely:

- `src/formats.js` — header block shrinks to: "Single source of truth for supported formats. Adding a format = adding one entry; validation, discovery and encoding all derive from it. `animated` marks formats that can hold more than one frame — reading a source as animated only pays off when the target can store frames."
- `src/defaults.js` — keep the libuv cap note and the one-line reason for `availableParallelism` ("follows CPU affinity and cgroup limits, unlike os.cpus()"); delete the rest of that block.
- `src/pool.js` — keep "Results come back in input order" note plus the JSDoc types; delete anything else.
- `src/errors.js` — reduce to one line: "A problem the user can fix; the CLI prints these without a stack trace."
- `src/cli/tune-runtime.js` — keep two facts: libuv reads `UV_THREADPOOL_SIZE` the first time work is queued, so it must be set before sharp loads (hence the late require); sharp's cache is disabled because each file is visited once. Delete the rest.

- [ ] **Step 2: Verify nothing broke**

Run: `npm test`
Expected: PASS, same test count as Task 8.

- [ ] **Step 3: Commit**

```bash
git add src
git commit -m "docs: trim comments to short factual notes"
```

---

### Task 10: Dependencies, package.json, README, CHANGELOG

**Files:**
- Modify: `package.json`, `package-lock.json` (via npm), `README.md`, `CHANGELOG.md`

**Interfaces:**
- Produces: `package.json` with `"version": "3.0.0"`, `"engines": { "node": ">=20.12.0" }`, and dependencies exactly `sharp` + `cli-progress`.

- [ ] **Step 1: Remove the dead dependencies**

```bash
npm uninstall glob chalk
```

- [ ] **Step 2: Bump version and engines**

In `package.json`: set `"version": "3.0.0"` and `"engines": { "node": ">=20.12.0" }`.

- [ ] **Step 3: Verify the tree still installs and passes**

```bash
npm ci && npm test
```

Expected: install succeeds with only `sharp`, `cli-progress` (plus their transitive deps) in the lockfile; tests PASS.

- [ ] **Step 4: Update `CHANGELOG.md`**

Prepend this entry (keep the file's existing format below it):

```markdown
## 3.0.0 — 2026-08-28

### Breaking

- `oi` no longer modifies source images by default. Output goes to a sibling
  folder named `<input>-oi-out` (a single file goes to its parent's sibling:
  `./pics/photo.jpg` → `./pics-oi-out/photo.jpg`). Use `--in-place` for the
  old overwrite behavior, or `-o <dir>` for a custom output folder.
- `-d, --delete-original` was removed. Originals are kept by default; use
  `--in-place` to overwrite them.
- Programmatic API: `findImageFiles` is now `discoverImages` and returns
  `{ root, files }`; `optimizeImages` takes `inputRoot` / `output` / `inPlace`
  options; the summary gained `copied` and `outputDir` and lost `deleted`;
  `optimizeImage` and `formatBytes` are no longer exported.
- Node >= 20.12 required.

### Changed

- Directories named `*-oi-out` are skipped during discovery, so re-running on
  a parent folder never re-processes previous output.
- In out-of-place same-format runs, a file that cannot be shrunk is copied to
  the output folder unchanged, keeping it a complete drop-in mirror.
- Dependencies trimmed to `sharp` and `cli-progress` (`glob` and `chalk`
  replaced by Node built-ins).
```

- [ ] **Step 5: Update `README.md`**

Rework the existing README (keep its voice and badges/sections that still apply):

1. Lead with the non-destructive default right after the intro: the two-line example `oi ./images` → `./images-oi-out/`, "your originals are never touched".
2. Replace the options table/list to match Task 8's help text exactly (add `-o, --output` and `--in-place`; delete `-d, --delete-original`).
3. Update every example command and its described effect to the new default; add one `--in-place` example and one `-o` example.
4. Update the programmatic-usage section to the Task 8 `src/index.js` doc-block example (`discoverImages` → `{ root, files }`, `optimizeImages(files, { inputRoot: root, ... })`).
5. Add a short "Migrating from 2.x" section: default output location changed; `-d` removed; `--in-place` restores the old behavior; API renames as in the CHANGELOG entry.
6. Leave the Speed section's numbers alone — they describe encoding, which did not change.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json README.md CHANGELOG.md
git commit -m "docs: bump to 3.0.0, trim deps to sharp and cli-progress, refresh docs"
```

---

### Task 11: CI matrix across the three platforms

**Files:**
- Create: `.github/workflows/test.yml`

**Interfaces:** none — CI proves the cross-platform constraint.

- [ ] **Step 1: Create the workflow**

```yaml
name: test

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: [20, 22]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm ci
      - run: npm test
```

- [ ] **Step 2: Sanity-check locally**

Run: `npm test`
Expected: PASS. (The matrix itself runs on GitHub after push.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: test on ubuntu, macos and windows with node 20 and 22"
```

---

## Verification (whole plan)

After Task 11, from a clean checkout:

```bash
npm ci
npm test
node bin/oi.js --help
```

Manual smoke test (any scratch directory; generate a test image with sharp so no fixture file is needed):

```bash
SMOKE=$(mktemp -d)/images
mkdir -p "$SMOKE"
node -e "require('sharp')({create:{width:400,height:300,channels:3,noise:{type:'gaussian',mean:128,sigma:30}}}).jpeg().toFile(process.argv[1]+'/photo.jpg')" "$SMOKE"
node bin/oi.js "$SMOKE"                 # writes $SMOKE-oi-out
ls "$SMOKE-oi-out"                      # optimized copy present
node bin/oi.js "$SMOKE" --in-place      # sources shrink in place
node bin/oi.js "$SMOKE" -d              # error mentioning --in-place, exit 1
```
