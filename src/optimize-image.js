"use strict";

const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");

const { DEFAULT_OPTIONS } = require("./defaults");
const {
  encodeAs,
  resolveOutputFormat,
  resolveOutputPath,
  supportsAnimation,
} = require("./formats");

/** Written first, then renamed, so a cancelled run never truncates an image. */
const TEMP_SUFFIX = ".oi_tmp";

/**
 * Unique per call: two images can legitimately resolve to one output path, and
 * with a shared temporary name the first rename pulls the file out from under
 * the second.
 */
function temporaryPathFor(outputPath) {
  return `${outputPath}.${crypto.randomBytes(6).toString("hex")}${TEMP_SUFFIX}`;
}

/**
 * Optimize one image and return what it cost and what it saved.
 *
 * Every filesystem call is async — callers run many of these at once, and a
 * synchronous stat or rename would stall every other image in flight.
 *
 * @returns {Promise<{originalSize: number, newSize: number, outputPath: string, deleted: boolean}>}
 */
async function optimizeImage(filePath, options = {}) {
  const { quality, format, size, deleteOriginal } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const outputFormat = resolveOutputFormat(filePath, format);
  const outputPath = resolveOutputPath(filePath, format);
  const originalSize = (await fs.stat(filePath)).size;

  // A phone writes its photos landscape and tags them with the quarter turn the
  // viewer should apply. Re-encoding drops that tag, so bake the turn into the
  // pixels first or every portrait photo comes out on its side.
  let pipeline = sharp(filePath, {
    animated: supportsAnimation(outputFormat),
  }).autoOrient();

  if (size) {
    pipeline = pipeline.resize(size.width, size.height, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const tempPath = temporaryPathFor(outputPath);
  const replacesOriginal = path.resolve(outputPath) === path.resolve(filePath);
  let newSize;

  try {
    await encodeAs(pipeline, outputFormat, quality).toFile(tempPath);
    newSize = (await fs.stat(tempPath)).size;

    // An already-tight image can come back bigger than it went in. Overwriting
    // the source with that is a strictly worse file, so keep what we had —
    // unless the caller asked for dimensions we would then be ignoring.
    if (replacesOriginal && !size && newSize >= originalSize) {
      await fs.rm(tempPath, { force: true });
      return {
        originalSize,
        newSize: originalSize,
        outputPath,
        deleted: false,
      };
    }

    await fs.rename(tempPath, outputPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }

  const deleted = Boolean(deleteOriginal) && !replacesOriginal;

  if (deleted) await fs.unlink(filePath);

  return { originalSize, newSize, outputPath, deleted };
}

module.exports = { optimizeImage };
