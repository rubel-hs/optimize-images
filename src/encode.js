"use strict";

const crypto = require("crypto");
const fs = require("fs/promises");
const fsSync = require("fs");
const sharp = require("sharp");

const { encodeAs, supportsAnimation } = require("./formats");

/** Written first, then renamed, so a cancelled run never truncates an image. */
const TEMP_SUFFIX = ".oi_tmp";

/**
 * Temp files with an encode still running behind them. An encode cannot be
 * cancelled once sharp has it, so a caller quitting immediately (a second
 * Ctrl+C) has to delete these itself or they outlive the process.
 */
const unfinishedTempPaths = new Set();

/** Random per call so no two writers ever share a temp path. */
function temporaryPathFor(outputPath) {
  return `${outputPath}.${crypto.randomBytes(6).toString("hex")}${TEMP_SUFFIX}`;
}

/**
 * Delete every temp file whose encode never finished. Synchronous on purpose:
 * the one caller is about to exit the process, and a promise would not settle.
 *
 * @returns {number} how many were removed
 */
function removeUnfinishedTempFiles() {
  let removed = 0;

  for (const tempPath of unfinishedTempPaths) {
    try {
      fsSync.rmSync(tempPath, { force: true });
      removed++;
    } catch {
      // Best effort: exiting matters more than a leftover file.
    }
  }

  unfinishedTempPaths.clear();
  return removed;
}

/**
 * Encode one planned job. The planner decided the paths and the larger-result
 * policy; this stage only encodes and moves files. All filesystem calls are
 * async — many of these run at once.
 *
 * @returns {Promise<{originalSize: number, newSize: number, action: "written"|"kept"|"copied"}>}
 */
async function encodeImage(job, { quality, size } = {}) {
  const originalSize = (await fs.stat(job.source)).size;

  // Orientation lives in metadata and re-encoding drops it: bake it in.
  let pipeline = sharp(job.source, {
    animated: supportsAnimation(job.format),
  }).autoOrient();

  if (size) {
    pipeline = pipeline.resize(size.width, size.height, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const tempPath = temporaryPathFor(job.outputPath);
  unfinishedTempPaths.add(tempPath);

  try {
    await encodeAs(pipeline, job.format, quality).toFile(tempPath);
    const newSize = (await fs.stat(tempPath)).size;

    if (newSize >= originalSize && job.whenLarger !== "write") {
      await fs.rm(tempPath, { force: true });
      if (job.whenLarger === "copy") {
        await fs.copyFile(job.source, job.outputPath);
      }
      return {
        originalSize,
        newSize: originalSize,
        action: job.whenLarger === "copy" ? "copied" : "kept",
      };
    }

    await fs.rename(tempPath, job.outputPath);
    return { originalSize, newSize, action: "written" };
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  } finally {
    unfinishedTempPaths.delete(tempPath);
  }
}

module.exports = { encodeImage, removeUnfinishedTempFiles };
