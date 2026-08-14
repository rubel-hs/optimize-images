# oi — Optimize Images

Fast CLI to compress, convert and resize images in bulk. Point it at a file or a
folder and it rewrites every supported image in place (or into a new format),
showing a progress bar and how many bytes you saved.

Powered by [sharp](https://sharp.pixelplumbing.com/).

## Install

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

All of them expose the same command: `oi`.

### Run without installing

```bash
npx oi-optimize-images ./images -q 70
```

## Usage

```
oi <path> [options]
```

`<path>` is a single image file or a directory. Directories are scanned
recursively.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-q, --quality <1-100>` | Output quality | `80` |
| `-f, --format <fmt>` | `original`, `jpg`, `png`, `webp`, `avif`, `tiff`, `gif` | `original` |
| `-s, --size <WxH>` | Resize to fit inside WxH, never enlarging | none |
| `-d, --delete-original` | Delete the source file after converting to a different format | off |
| `-h, --help` | Show help | |

### Examples

```bash
oi ./images                          # optimize in place, quality 80, keep formats
oi ./images -q 60                    # quality 60
oi photo.png -f webp                 # convert one file to WebP
oi ./images -f webp -d               # convert all to WebP and remove the originals
oi ./images -q 90 -f png -s 800x600  # convert to PNG, fit inside 800x600, quality 90
```

## Behavior notes

- **Writes in place.** With `-f original` the source file is overwritten. Work on a
  copy or a clean git tree if you want the originals back.
- Each file is written to a `.oi_tmp` file first and then renamed, so an
  interrupted run does not leave a half-written image in place of your original.
- `-d` only deletes when the output path actually differs from the input path, so
  it is a no-op with `-f original`.
- `-s` uses `fit: inside` with `withoutEnlargement`, so smaller images are left at
  their original dimensions.
- Supported inputs: `.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`, `.tiff`, `.tif`,
  `.gif`.
- Failed files are reported individually and do not abort the run.

## Requirements

Node.js >= 18.17.0.

## License

MIT © Rubel Hossain
