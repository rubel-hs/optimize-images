"use strict";

const path = require("path");

/**
 * The single source of truth for every image format this tool understands.
 *
 * Adding a format means adding one entry here — the CLI's `--format` validation,
 * the file discovery glob, the extension lookup and the sharp encoder call are
 * all derived from this object.
 *
 * `animated` marks the formats that can hold more than one frame. Reading a
 * source as animated only pays off if the target can store the frames; do it
 * for a still target and every frame lands in one tall strip instead.
 */
const FORMATS = {
  jpg: {
    outputExtension: ".jpg",
    inputExtensions: [".jpg", ".jpeg"],
    encode: (pipeline, quality) => pipeline.jpeg({ quality, mozjpeg: true }),
  },
  png: {
    outputExtension: ".png",
    inputExtensions: [".png"],
    encode: (pipeline, quality) =>
      pipeline.png({ quality, compressionLevel: 9, effort: 10 }),
  },
  webp: {
    outputExtension: ".webp",
    inputExtensions: [".webp"],
    animated: true,
    encode: (pipeline, quality) => pipeline.webp({ quality }),
  },
  avif: {
    outputExtension: ".avif",
    inputExtensions: [".avif"],
    encode: (pipeline, quality) => pipeline.avif({ quality }),
  },
  tiff: {
    outputExtension: ".tiff",
    inputExtensions: [".tiff", ".tif"],
    encode: (pipeline, quality) => pipeline.tiff({ quality }),
  },
  gif: {
    outputExtension: ".gif",
    inputExtensions: [".gif"],
    animated: true,
    encode: (pipeline) => pipeline.gif(),
  },
};

/** `--format original` means "encode each file back to whatever it already is". */
const KEEP_ORIGINAL_FORMAT = "original";

/** Used when a file's extension does not map to a known format. */
const FALLBACK_FORMAT = "jpg";

/** Spellings a user may type that mean the same format. */
const FORMAT_ALIASES = { jpeg: "jpg", tif: "tiff" };

const FORMAT_NAMES = Object.keys(FORMATS);

/** Everything `--format` accepts, in the order the help text should list it. */
const REQUESTABLE_FORMATS = [
  KEEP_ORIGINAL_FORMAT,
  ...FORMAT_NAMES,
  ...Object.keys(FORMAT_ALIASES),
];

const INPUT_EXTENSIONS = FORMAT_NAMES.flatMap(
  (name) => FORMATS[name].inputExtensions,
);

const FORMAT_BY_INPUT_EXTENSION = Object.fromEntries(
  FORMAT_NAMES.flatMap((name) =>
    FORMATS[name].inputExtensions.map((extension) => [extension, name]),
  ),
);

/** e.g. `**\/*.{jpg,jpeg,png,webp,avif,tiff,tif,gif}` */
const IMAGE_GLOB_PATTERN = `**/*.{${INPUT_EXTENSIONS.map((extension) =>
  extension.slice(1),
).join(",")}}`;

/** Canonical format name for anything the user typed, or `null` if unknown. */
function normalizeFormatName(requestedFormat) {
  const name = String(requestedFormat).toLowerCase();
  if (name === KEEP_ORIGINAL_FORMAT) return KEEP_ORIGINAL_FORMAT;
  const canonical = FORMAT_ALIASES[name] || name;
  return FORMATS[canonical] ? canonical : null;
}

function isSupportedImage(filePath) {
  return path.extname(filePath).toLowerCase() in FORMAT_BY_INPUT_EXTENSION;
}

/** The format a given file should be encoded as, honouring `original`. */
function resolveOutputFormat(filePath, requestedFormat) {
  if (requestedFormat !== KEEP_ORIGINAL_FORMAT) {
    return normalizeFormatName(requestedFormat);
  }
  const extension = path.extname(filePath).toLowerCase();
  return FORMAT_BY_INPUT_EXTENSION[extension] || FALLBACK_FORMAT;
}

/** Where a given file should be written — the file itself when keeping format. */
function resolveOutputPath(filePath, requestedFormat) {
  if (requestedFormat === KEEP_ORIGINAL_FORMAT) return filePath;

  const format = normalizeFormatName(requestedFormat);
  const currentExtension = path.extname(filePath);
  const baseName = path.basename(filePath, currentExtension);

  return path.join(
    path.dirname(filePath),
    `${baseName}${FORMATS[format].outputExtension}`,
  );
}

/** Whether a format can store more than one frame. */
function supportsAnimation(format) {
  return Boolean(FORMATS[format]?.animated);
}

function encodeAs(pipeline, format, quality) {
  const encode = (FORMATS[format] || FORMATS[FALLBACK_FORMAT]).encode;
  return encode(pipeline, quality);
}

module.exports = {
  FORMAT_NAMES,
  IMAGE_GLOB_PATTERN,
  KEEP_ORIGINAL_FORMAT,
  REQUESTABLE_FORMATS,
  encodeAs,
  isSupportedImage,
  normalizeFormatName,
  resolveOutputFormat,
  resolveOutputPath,
  supportsAnimation,
};
