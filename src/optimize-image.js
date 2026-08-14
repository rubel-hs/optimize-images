"use strict";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const { DEFAULT_OPTIONS } = require("./defaults");
const { encodeAs, resolveOutputFormat, resolveOutputPath } = require("./formats");

/** Written first, then renamed, so a cancelled run never truncates an image. */
const TEMP_SUFFIX = ".oi_tmp";

/**
 * Optimize one image and return what it cost and what it saved.
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
  const originalSize = fs.statSync(filePath).size;

  let pipeline = sharp(filePath);

  if (size) {
    pipeline = pipeline.resize(size.width, size.height, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const tempPath = outputPath + TEMP_SUFFIX;
  await encodeAs(pipeline, outputFormat, quality).toFile(tempPath);
  fs.renameSync(tempPath, outputPath);

  const newSize = fs.statSync(outputPath).size;
  const replacesOriginal =
    path.resolve(outputPath) === path.resolve(filePath);
  const deleted = Boolean(deleteOriginal) && !replacesOriginal;

  if (deleted) fs.unlinkSync(filePath);

  return { originalSize, newSize, outputPath, deleted };
}

module.exports = { optimizeImage };
