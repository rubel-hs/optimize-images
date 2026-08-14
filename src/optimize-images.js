"use strict";

const { optimizeImage } = require("./optimize-image");

const noop = () => {};

/**
 * Optimize every file in turn. One broken image is reported and skipped rather
 * than aborting the run.
 *
 * Progress is delivered through callbacks so this stays free of any terminal
 * concerns — the CLI renders it, another caller could log it or ignore it.
 *
 * @param {string[]} files
 * @param {object} options - see DEFAULT_OPTIONS
 * @param {{onProgress?: Function, onFailure?: Function}} [handlers]
 */
async function optimizeImages(files, options = {}, handlers = {}) {
  const { onProgress = noop, onFailure = noop } = handlers;

  const summary = {
    total: files.length,
    optimized: 0,
    failed: 0,
    deleted: 0,
    originalSize: 0,
    newSize: 0,
    failures: [],
  };

  for (const [index, file] of files.entries()) {
    try {
      const result = await optimizeImage(file, options);
      summary.optimized++;
      summary.originalSize += result.originalSize;
      summary.newSize += result.newSize;
      if (result.deleted) summary.deleted++;
    } catch (error) {
      summary.failed++;
      summary.failures.push({ file, message: error.message });
      onFailure(file, error);
    }

    onProgress(index + 1, files.length);
  }

  return summary;
}

module.exports = { optimizeImages };
