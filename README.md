<img width="1774" height="887" alt="image" src="https://github.com/user-attachments/assets/3b166bc3-b24f-449c-82af-26c4d6c12bbb" />

[![npm version](https://img.shields.io/npm/v/oi-optimize-images.svg)](https://www.npmjs.com/package/oi-optimize-images)
[![license](https://img.shields.io/npm/l/oi-optimize-images.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/oi-optimize-images.svg)](https://nodejs.org)

**Shrink a whole folder of images with one short command.**

```bash
oi ./images
```

Optimized copies land in `./images-oi-out/` — your originals are never
touched. You get told exactly how many bytes you saved. Powered by
[sharp](https://sharp.pixelplumbing.com/).

```
  oi — Optimize Images
  ─────────────────────
  Path:     /home/you/site/images
  Output:   /home/you/site/images-oi-out
  Images:   24
  Quality:  80
  Format:   original (keep)
  Workers:  8

  ████████████████████ 100% | 24/24 files

  ✓ 24 image(s) optimized
  Output: /home/you/site/images-oi-out
  Before: 18.4 MB  →  After: 3.1 MB
  Saved: 15.3 MB (83.2%)
```

---

## ✨ Features

- 📦 **Bulk by default** — point it at a folder, it walks every subfolder too
- 🧵 **Uses the whole machine** — encodes one image per core, not one at a time
- 🎚️ **Quality dial** — one flag, `1` to `100`, sensible `80` default
- 🔄 **Format conversion** — JPG, PNG, WebP, AVIF, TIFF, GIF
- 📐 **Smart resize** — fits inside your box and never upscales a small image
- 📊 **Live progress bar** — plus a before/after savings report at the end
- 🛡️ **Non-destructive by default** — output goes to a sibling `-oi-out`
  folder; add `--in-place` when you want the old overwrite behavior
- 🔒 **Safe writes** — each file lands in a temp file and is renamed, so a
  cancelled run never leaves a half-written image behind
- 🙃 **Upright photos** — bakes in the camera's rotation instead of dropping it
- 🎞️ **Keeps animations** — animated GIF and WebP keep every frame
- ⚖️ **Never grows a file** — if re-encoding would cost bytes, the original
  size wins instead
- 💪 **Keeps going** — one broken image is reported and skipped, not fatal
- 🚀 **mozjpeg encoding** — smaller JPEGs than stock at the same quality
- 🪶 **Tiny install** — sharp plus cli-progress, nothing else
- 🧩 **Usable as a library** — `require("oi-optimize-images")` for the same engine without the CLI

---

## 📥 Install

Pick your package manager. All four give you the same `oi` command:

```bash
npm install -g oi-optimize-images
```

```bash
yarn global add oi-optimize-images
```

```bash
pnpm add -g oi-optimize-images
```

```bash
bun add -g oi-optimize-images
```

### 🏃 Or skip installing

```bash
npx oi-optimize-images ./images -q 70
```

---

## 🚀 Quick start

**Squash a folder, keep the formats:**

```bash
oi ./images
```

Writes optimized copies to `./images-oi-out/`. `./images` itself is untouched.

**Squash harder:**

```bash
oi ./images -q 60
```

**Convert everything to WebP:**

```bash
oi ./images -f webp
```

**Overwrite the originals instead of writing copies:**

```bash
oi ./images --in-place
```

**Write into a folder you choose:**

```bash
oi ./images -o ./optimized
```

**Make thumbnails, max 400×400:**

```bash
oi ./images -f webp -s 400x400 -q 75
```

**Leave some cores free for everything else:**

```bash
oi ./images -j 2
```

**Just one file:**

```bash
oi ./pics/photo.jpg
```

Writes to `./pics-oi-out/photo.jpg` — a single file follows the same
parent-folder sibling rule as a directory.

---

## ⚙️ Options

| Flag | What it does | Default |
|------|--------------|---------|
| `-q, --quality <1-100>` | 🎚️ Output quality | `80` |
| `-f, --format <fmt>` | 🔄 `original`, `jpg`, `png`, `webp`, `avif`, `tiff`, `gif` | `original` |
| `-s, --size <WxH>` | 📐 Fit inside these dimensions, e.g. `800x600` | none |
| `-j, --concurrency <n>` | 🧵 Images encoded at once | one per core |
| `-o, --output <dir>` | 📁 Write into `<dir>` instead of the `-oi-out` sibling | none |
| `--in-place` | ♻️ Overwrite the source files where they are | off |
| `-h, --help` | 💬 Show help | |

`--in-place` and `-o` can't be combined — pick one.

**Which quality should I use?**

| Value | Good for |
|-------|----------|
| `90-100` | 🎨 Photography, print, archival |
| `75-85` | 🌐 Web images — the sweet spot |
| `60-75` | ⚡ Thumbnails, previews, speed-first pages |
| `< 60` | 🪶 When bytes matter far more than looks |

---

## ⚡ Speed

Several images encode at once. On an 8-core laptop, 32 photos at 1600×1200
converted to WebP:

| `-j 1` | `-j 2` | `-j 4` | `-j 8` *(default here)* |
|--------|--------|--------|--------------------------|
| 14.6s | 8.7s | 6.2s | 5.0s |

Same bytes out whichever you pick — concurrency only changes how long you wait.

The default reads the cores actually available, so a 2-core VM uses two, and a
container capped at one CPU uses one rather than reaching for the host's total.
Turning `-j` *down* is the useful direction, for when you want the machine back.

---

## ⚠️ Good to know

- **Originals stay put by default.** Output goes to a sibling folder named
  `<input>-oi-out` — `oi ./images` writes into `./images-oi-out`, and a single
  file like `oi ./pics/photo.jpg` writes into `./pics-oi-out/photo.jpg`. Use
  `--in-place` to overwrite sources the old way, or `-o <dir>` to pick the
  output folder yourself.
- **`*-oi-out` folders are skipped on the way in.** Pointing `oi` at a parent
  folder never re-processes a previous run's own output.
- **A file that can't be shrunk still lands in the output folder.** Out of
  place, with the format unchanged, a file that would grow is copied over as
  is instead of being skipped, so the output stays a complete mirror of the
  input.
- **`-s` never enlarges.** It uses fit-inside with no upscaling, so an image
  already smaller than your box is left at its own size.
- **Two files can't share one output.** If `logo.jpg` and `logo.png` would both
  become `logo.webp`, the run stops before writing anything and tells you which
  two clash. Convert them separately.
- **A file already in the target format is skipped, not fought over.** If a
  folder holds both `logo.jpg` and `logo.webp` and you convert it to webp, the
  `.jpg` converts and the existing `.webp` is left alone rather than causing a
  collision error — the same rule that makes a second `--in-place` run over
  the same folder safe. The summary says how many were left alone.
- **Re-running costs quality, with `--in-place`.** Each pass re-encodes, so
  compressing an already compressed file again degrades it further. A rewrite
  that would come out *bigger* is thrown away and the original kept — but that
  is a size guard, not a quality one.
- **`-j` reads the cores you actually have.** Inside a container limited to one
  CPU it uses one worker rather than the host's full count.

**Supported inputs:** `.jpg` `.jpeg` `.png` `.webp` `.avif` `.tiff` `.tif` `.gif`

---

## 📦 Use it from Node

The CLI is a thin layer over an API you can call yourself:

```js
const { discoverImages, optimizeImages } = require("oi-optimize-images");

const { root, files } = await discoverImages("./images");
const summary = await optimizeImages(files, { inputRoot: root, quality: 70 });

console.log(`Saved ${summary.originalSize - summary.newSize} bytes`);
console.log(`Output in ${summary.outputDir}`);
```

`discoverImages(path)` resolves `path` and returns `{ root, files }`: the
folder the run is rooted at and the absolute path of every image found under
it (a single file's `root` is its parent folder). `*-oi-out` folders are
skipped automatically.

By default nothing under `root` is modified — output goes to the
`${root}-oi-out` sibling. Pass `output: "<dir>"` for a folder of your choosing,
or `inPlace: true` to overwrite sources instead; `inputRoot` is required
unless `inPlace` is set. `optimizeImages` otherwise takes the same tuning
options as the flags (`quality`, `format`, `size: { width, height }`,
`concurrency`) and an optional third argument, `{ onProgress, onFailure }`.
It never prints and never exits — bad input throws a `UserError`.

`summary` comes back as
`{ total, optimized, copied, skipped, failed, originalSize, newSize, failures, outputDir }`.
`copied` counts files that couldn't be shrunk and were mirrored unchanged;
`outputDir` is `null` when `inPlace` was used.

`concurrency` defaults to one image per core. `QUALITY_MIN`/`QUALITY_MAX` and
`CONCURRENCY_MIN`/`CONCURRENCY_MAX` are exported if you want to validate input
before handing it over.

---

## 🔀 Migrating from 2.x

- **The default output location changed.** `oi ./images` used to overwrite
  files in `./images`; it now writes into `./images-oi-out` and leaves
  `./images` alone. Add `--in-place` to get the old overwrite behavior back,
  or `-o <dir>` to pick a different output folder.
- **`-d, --delete-original` is gone.** Originals are kept by default now, so
  there's nothing to opt out of deleting. `--in-place` still overwrites a
  source in place, including when converting it to a new format.
- **API renames.** `findImageFiles` is now `discoverImages` and returns
  `{ root, files }` instead of a plain array. `optimizeImages` takes
  `inputRoot` / `output` / `inPlace` instead of `deleteOriginal`. The summary
  gained `copied` and `outputDir` and lost `deleted`. `optimizeImage` and
  `formatBytes` are no longer exported.
- **Node >= 20.12 is now required**, up from 20.9.0.

---

## 🤝 Contributing

```
bin/oi.js                    shebang launcher, hands off to the CLI
src/
  index.js                   public API — the root export
  formats.js                 every supported format: extensions + sharp encoder
  defaults.js                default options, quality and worker ranges
  discover.js                a path in, { root, files } out — skips *-oi-out folders
  plan.js                    decides each job's output path and collision rules
  encode.js                  one file: resize, encode, atomic write
  run.js                     many files: plan the jobs, spread over workers, tally a summary
  pool.js                    runs N jobs at a time, results in input order
  errors.js                  problems the user can fix
  cli/
    index.js                 wires parsing, discovery and reporting together
    args.js                  argv -> options
    help.js                  the --help screen
    reporter.js              every line the CLI prints
    tune-runtime.js          sizes the thread pool before sharp loads
test/                        one file per module, plus end-to-end CLI tests
```

Two rules keep it easy to work in:

- **Formats live in one place.** `src/formats.js` drives `--format` validation,
  file discovery, the extension lookup and the sharp call. Supporting a
  new format is one entry in `FORMATS` and nothing else.
- **The core never prints and never exits.** Anything under `src/` outside
  `src/cli/` throws `UserError` and returns data. `src/cli/reporter.js` owns the
  terminal, which is what makes the engine importable and testable.

The suite runs on Node's built-in test runner — no framework to install. It
generates real images into a temp directory, so it exercises sharp for real
rather than mocking it.

```bash
npm test
```

Every user-visible change goes in [CHANGELOG.md](./CHANGELOG.md) under
`[Unreleased]`, and moves under a version heading at release time.

---

## 📋 Requirements

Node.js **>= 20.12.0**

## 📄 License

MIT © Rubel Hossain
