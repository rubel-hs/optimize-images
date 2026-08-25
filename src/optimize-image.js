"use strict";

const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");

const { DEFAULT_OPTIONS } = require("./defaults");
const { encodeAs, resolveOutputFormat, resolveOutputPath } = require("./formats");

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

  let pipeline = sharp(filePath);

  if (size) {
    pipeline = pipeline.resize(size.width, size.height, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const tempPath = temporaryPathFor(outputPath);

  try {
    await encodeAs(pipeline, outputFormat, quality).toFile(tempPath);
    await fs.rename(tempPath, outputPath);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }

  const newSize = (await fs.stat(outputPath)).size;
  const replacesOriginal =
    path.resolve(outputPath) === path.resolve(filePath);
  const deleted = Boolean(deleteOriginal) && !replacesOriginal;

  if (deleted) await fs.unlink(filePath);

  return { originalSize, newSize, outputPath, deleted };
}

module.exports = { optimizeImage };
