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

  ████████████████████ 100% | 24/24 files

  ✓ 24 image(s) optimized
  Before: 18.4 MB  →  After: 3.1 MB
  Saved: 15.3 MB (83.2%)
```

---

## ✨ Features

- 📦 **Bulk by default** — point it at a folder, it walks every subfolder too
- 🎚️ **Quality dial** — one flag, `1` to `100`, sensible `80` default
- 🔄 **Format conversion** — JPG, PNG, WebP, AVIF, TIFF, GIF
- 📐 **Smart resize** — fits inside your box and never upscales a small image
- 📊 **Live progress bar** — plus a before/after savings report at the end
- 🛡️ **Safe writes** — each file lands in a temp file and is renamed, so a
  cancelled run never leaves a half-written image where your original was
- 🧹 **Optional cleanup** — drop the source files after converting
- 💪 **Keeps going** — one broken image is reported and skipped, not fatal
- 🚀 **mozjpeg encoding** — smaller JPEGs than stock at the same quality
- 🪶 **Tiny install** — 4 files, 5.2 kB

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

## 📋 Requirements

Node.js **>= 18.17.0**

## 📄 License

MIT © Rubel Hossain
