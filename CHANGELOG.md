# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0] - 2026-08-27

Images are now encoded several at a time instead of one after another, and seven
bugs found along the way are fixed. Several of those fixes change what lands on
disk — see [Upgrading](#upgrading-from-200) below.

### Added

- `-j, --concurrency <n>` — how many images to encode at once. Defaults to one
  per core, read from what the machine actually offers, so a container pinned to
  one CPU uses one worker rather than grabbing for the whole host.
- `concurrency` option on `optimizeImages()`, matching the flag.
- `CONCURRENCY_MIN` and `CONCURRENCY_MAX` exported alongside the quality bounds,
  so a caller can validate a worker count before handing it over.
- `summary.skipped` — how many files were left alone because another file's
  conversion is about to replace them.
- The run header now shows the worker count, and the summary reports how many
  files were left alone.

### Changed

- **Images are encoded concurrently.** 32 photos at 1600×1200 converted from
  JPEG to WebP went from 21.8s to 4.8s on an 8-core machine, producing
  byte-identical output. Raising the encoder's own thread count does not help
  and was measured at 1.01× — the work has to spread across images, not within
  one.
- `oi` sizes Node's thread pool to the machine before sharp loads. Without this
  the pool holds four threads and caps how many images can encode at once,
  whatever `-j` asks for.
- sharp's operation cache is turned off for CLI runs. A run visits every file
  once, so the cache cannot hit; it only held memory and open file descriptors.
- Every filesystem call in the encode path is async, so one image's rename no
  longer stalls the others.

### Fixed

- **Two images could silently overwrite each other.** Converting a folder to
  WebP made `logo.jpg` and `logo.png` both write `logo.webp`. One replaced the
  other with no error, and the summary counted both as optimized. Such a run is
  now refused before anything is written, naming the two files that clash.
- **Rotated photos came out on their side.** Cameras store portrait photos
  landscape with an EXIF orientation tag; re-encoding dropped the tag, so every
  such photo ended up sideways. The rotation is now applied to the pixels.
- **Animated GIF and WebP lost every frame but the first.** Animations were
  flattened to a still. Formats that can hold frames are now read as animated
  when the target can store them; a still target still takes the first frame
  rather than a tall strip of all of them.
- **Re-encoding could leave a file bigger than it started.** An already-tight
  image can cost bytes to rewrite, and the bigger version replaced the original.
  It is now discarded — unless a resize was requested, which would otherwise be
  silently ignored.
- **Running the same conversion twice failed.** Converting a folder to WebP
  leaves the sources beside their output, so a second run put `logo.jpg` and
  `logo.webp` in the same batch and the new collision check stopped everything.
  The file that is about to be replaced is now skipped and counted.
- **A failed rename left its temporary file behind.** The temporary file is now
  removed when the write cannot be completed.
- **The worker count was capped at 64**, which would have left a 128-core
  machine running at half capacity. The cap is now libuv's own thread pool
  ceiling.

### Upgrading from 2.0.0

The API is backwards compatible, but several fixes change what ends up on disk:

- EXIF-rotated photos now come out with their width and height swapped, because
  the rotation is finally applied. This is the correct result; anything
  measuring dimensions after a run will see different numbers.
- Animated files keep their frames, so they can be larger than the
  single-frame output 2.0.0 produced.
- An in-place run that would grow a file now leaves it untouched, so
  `summary.newSize` can equal `summary.originalSize`.
- `optimizeImages()` now throws a `UserError` when two entries in the file list
  resolve to one output path. It previously returned a summary and lost an
  image.

## [2.0.0] - 2026-08-15

### Changed

- **Node.js 20.9.0 or newer is now required**, up from 18.17.0.
- Upgraded `sharp` to `^0.35.3` and `glob` to `^13.0.6`, which removes the
  install warnings the older versions produced.

## [1.1.0] - 2026-08-15

### Added

- A test suite on Node's built-in runner, generating real images into a temp
  directory rather than mocking sharp.
- `AGENTS.md`, documenting the project's conventions.

### Changed

- Split the single `cli.js` into `src/` modules, separating the engine from the
  terminal so the package is usable as a library.

## [1.0.1] - 2026-08-15

### Fixed

- Pointed the package metadata at the correct repository.

## [1.0.0] - 2026-08-14

First release on npm as `oi-optimize-images`.

### Added

- `oi <path>` — compress every image in a folder, walking subfolders.
- `-q, --quality`, `-f, --format`, `-s, --size`, `-d, --delete-original`.
- JPG, PNG, WebP, AVIF, TIFF and GIF, with mozjpeg for JPEG output.
- Progress bar and a before/after savings report.

[Unreleased]: https://github.com/rubel-hs/optimize-images/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/rubel-hs/optimize-images/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/rubel-hs/optimize-images/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/rubel-hs/optimize-images/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/rubel-hs/optimize-images/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/rubel-hs/optimize-images/releases/tag/v1.0.0
