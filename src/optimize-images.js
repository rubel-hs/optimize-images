"use strict";

const path = require("path");

const { DEFAULT_OPTIONS } = require("./defaults");
const { resolveOutputPath } = require("./formats");
const { optimizeImage } = require("./optimize-image");
const { UserError } = require("./user-error");

const noop = () => {};

/**
 * Two sources that resolve to one output would race, and the loser's pixels
 * would vanish with no error. Catch it up front rather than half way through.
 */
function assertNoOutputCollisions(files, format) {
  const claimedBy = new Map();

  for (const file of files) {
    const output = path.resolve(resolveOutputPath(file, format));
    const claimant = claimedBy.get(output);

    if (claimant) {
      throw new UserError(
        `"${path.basename(claimant)}" and "${path.basename(file)}" would both ` +
          `be written to ${output}. Convert them separately.`,
      );
    }

    claimedBy.set(output, file);
  }
}

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
  const { format } = { ...DEFAULT_OPTIONS, ...options };

  assertNoOutputCollisions(files, format);

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
