# 🖼️ oi — Optimize Images

[![npm version](https://img.shields.io/npm/v/oi-optimize-images.svg)](https://www.npmjs.com/package/oi-optimize-images)
[![license](https://img.shields.io/npm/l/oi-optimize-images.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/oi-optimize-images.svg)](https://nodejs.org)

**Shrink a whole folder of images with one short command.**

```bash
oi ./images
```

That's it. Every image in the folder gets compressed in place, and you get told
exactly how many bytes you saved. Powered by [sharp](https://sharp.pixelplumbing.com/).

```
  oi — Optimize Images
  ─────────────────────
  Path:     /home/you/site/images
  Images:   24
  Quality:  80
  Format:   original (keep)
  Workers:  8

  ████████████████████ 100% | 24/24 files

  ✓ 24 image(s) optimized
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
- 🛡️ **Safe writes** — each file lands in a temp file and is renamed, so a
  cancelled run never leaves a half-written image where your original was
- 🙃 **Upright photos** — bakes in the camera's rotation instead of dropping it
- 🎞️ **Keeps animations** — animated GIF and WebP keep every frame
- ⚖️ **Never grows a file** — if re-encoding would cost bytes, the original stays
- 🧹 **Optional cleanup** — drop the source files after converting
- 💪 **Keeps going** — one broken image is reported and skipped, not fatal
- 🚀 **mozjpeg encoding** — smaller JPEGs than stock at the same quality
- 🪶 **Tiny install** — 9.2 kB packed, sharp plus three small helpers
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

**Squash harder:**

```bash
oi ./images -q 60
```

**Convert everything to WebP:**

```bash
oi ./images -f webp
```

**Convert to WebP and delete the old files:**

```bash
oi ./images -f webp -d
```

**Make thumbnails, max 400×400:**

```bash
oi ./images -f webp -s 400x400 -q 75
```

**Just one file:**

```bash
oi photo.png -f webp
```

---

## ⚙️ Options

| Flag | What it does | Default |
|------|--------------|---------|
| `-q, --quality <1-100>` | 🎚️ Output quality | `80` |
| `-f, --format <fmt>` | 🔄 `original`, `jpg`, `png`, `webp`, `avif`, `tiff`, `gif` | `original` |
| `-s, --size <WxH>` | 📐 Fit inside these dimensions, e.g. `800x600` | none |
| `-j, --concurrency <n>` | 🧵 Images encoded at once | one per core |
| `-d, --delete-original` | 🧹 Delete the source after converting to a new format | off |
| `-h, --help` | 💬 Show help | |

**Which quality should I use?**

| Value | Good for |
|-------|----------|
| `90-100` | 🎨 Photography, print, archival |
| `75-85` | 🌐 Web images — the sweet spot |
| `60-75` | ⚡ Thumbnails, previews, speed-first pages |
| `< 60` | 🪶 When bytes matter far more than looks |

---

## ⚠️ Good to know

- **It overwrites in place.** With `-f original` your source file *is* the
  output file. Run it on a copy, or on a clean git tree, if you want the
  originals back.
- **`-d` is a no-op with `-f original`** — it only deletes when the output path
  actually differs from the input path, so it can't delete your only copy.
- **`-s` never enlarges.** It uses fit-inside with no upscaling, so an image
  already smaller than your box is left at its own size.
- **Re-running costs quality.** Each pass re-encodes, so compressing an already
  compressed file again degrades it further.

**Supported inputs:** `.jpg` `.jpeg` `.png` `.webp` `.avif` `.tiff` `.tif` `.gif`

---

## 📦 Use it from Node

The CLI is a thin layer over an API you can call yourself:

```js
const { findImageFiles, optimizeImages, formatBytes } = require("oi-optimize-images");

const files = await findImageFiles("./images");
const summary = await optimizeImages(files, { quality: 70, format: "webp" });

console.log(`Saved ${formatBytes(summary.originalSize - summary.newSize)}`);
```

`optimizeImages` takes the same options as the flags (`quality`, `format`,
`size: { width, height }`, `deleteOriginal`) and an optional
`{ onProgress, onFailure }` pair of callbacks. It never prints and never exits —
bad input throws a `UserError`.

---

## 🤝 Contributing

```
bin/oi.js                    shebang launcher, hands off to the CLI
src/
  index.js                   public API — the root export
  formats.js                 every supported format: extensions + sharp encoder
  defaults.js                default options and the quality range
  find-image-files.js        a path in, absolute image paths out
  optimize-image.js          one file: resize, encode, atomic write, cleanup
  optimize-images.js         many files: loop, tally, survive failures
  format-bytes.js            1536 -> "1.5 KB"
  user-error.js              problems the user can fix
  cli/
    index.js                 wires parsing, discovery and reporting together
    parse-arguments.js       argv -> options
    help.js                  the --help screen
    reporter.js              every line the CLI prints
test/                        one file per module, plus end-to-end CLI tests
```

Two rules keep it easy to work in:

- **Formats live in one place.** `src/formats.js` drives `--format` validation,
  the file-discovery glob, the extension lookup and the sharp call. Supporting a
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

---

## 📋 Requirements

Node.js **>= 20.9.0**

## 📄 License

MIT © Rubel Hossain
