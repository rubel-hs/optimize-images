"use strict";

const fs = require("fs");
const path = require("path");
const { glob } = require("glob");

const { IMAGE_GLOB_PATTERN, isSupportedImage } = require("./formats");
const { UserError } = require("./errors");

/**
 * Expand a file or directory path into the absolute paths of every image to
 * process. Directories are walked recursively.
 */
async function findImageFiles(inputPath) {
  const targetPath = path.resolve(inputPath);

  if (!fs.existsSync(targetPath)) {
    throw new UserError(`Path does not exist: ${targetPath}`);
  }

  const stats = fs.statSync(targetPath);

  if (stats.isFile()) {
    if (!isSupportedImage(targetPath)) {
      throw new UserError(
        `Unsupported file type: ${path.extname(targetPath).toLowerCase()}`,
      );
    }
    return [targetPath];
  }

  if (!stats.isDirectory()) {
    throw new UserError("Path must be a file or directory.");
  }

  const files = await glob(IMAGE_GLOB_PATTERN, {
    cwd: targetPath,
    absolute: true,
    nocase: true,
  });

  if (files.length === 0) {
    throw new UserError(`No supported images found in: ${targetPath}`);
  }

  return files;
}

module.exports = { findImageFiles };
