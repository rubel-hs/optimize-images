"use strict";

const fs = require("fs/promises");
const path = require("path");

const { isSupportedImage } = require("./formats");
const { UserError } = require("./errors");

const OUTPUT_DIR_SUFFIX = "-oi-out";

/** True when any parent segment of the relative path is an oi output folder. */
function insideOutputDir(relativePath) {
  return relativePath
    .split(path.sep)
    .slice(0, -1)
    .some((segment) => segment.endsWith(OUTPUT_DIR_SUFFIX));
}

/**
 * Expand a file or directory path into { root, files }: the folder the run is
 * rooted at and the absolute path of every image to process, sorted.
 *
 * Previous runs' output folders (*-oi-out) are skipped, so re-running on a
 * parent never re-processes its own output.
 */
async function discoverImages(inputPath) {
  const target = path.resolve(inputPath);

  let stats;
  try {
    stats = await fs.stat(target);
  } catch {
    throw new UserError(`Path does not exist: ${target}`);
  }

  if (stats.isFile()) {
    if (!isSupportedImage(target)) {
      throw new UserError(
        `Unsupported file type: ${path.extname(target).toLowerCase()}`,
      );
    }
    return { root: path.dirname(target), files: [target] };
  }

  if (!stats.isDirectory()) {
    throw new UserError("Path must be a file or directory.");
  }

  const entries = await fs.readdir(target, {
    recursive: true,
    withFileTypes: true,
  });

  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter(isSupportedImage)
    .filter((file) => !insideOutputDir(path.relative(target, file)))
    .sort();

  if (files.length === 0) {
    throw new UserError(`No supported images found in: ${target}`);
  }

  return { root: target, files };
}

module.exports = { OUTPUT_DIR_SUFFIX, discoverImages };
