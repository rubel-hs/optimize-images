"use strict";

const path = require("path");

const { DEFAULT_OPTIONS } = require("./defaults");
const { resolveOutputPath } = require("./formats");
const { optimizeImage } = require("./optimize-image");
const { runPool } = require("./pool");
const { UserError } = require("./errors");

const noop = () => {};

/**
 * Work out which files to encode, given that several can resolve to one output.
 *
 * Running the same conversion twice is the ordinary case: the folder now holds
 * both `logo.jpg` and the `logo.webp` the last run produced, and both claim
 * `logo.webp`. The claimant that *is* the output is about to be overwritten by
 * the other, so encoding it would be wasted work and, worse, a race for the same
 * file — leave it alone and let the conversion land.
 *
 * Two files that both want to become a third are a different matter. Nothing
 * marks one as the winner, so the loser's pixels would vanish with no error.
 * That is worth refusing before a single byte is written.
 */
function planRun(files, format) {
  const claimantsByOutput = new Map();

  for (const file of files) {
    const output = path.resolve(resolveOutputPath(file, format));
    const claimants = claimantsByOutput.get(output) || [];
    claimants.push(file);
    claimantsByOutput.set(output, claimants);
  }

  const overwritten = new Set();

  for (const [output, claimants] of claimantsByOutput) {
    if (claimants.length === 1) continue;

    const converting = claimants.filter((file) => path.resolve(file) !== output);

    if (converting.length > 1) {
      throw new UserError(
        `"${path.basename(converting[0])}" and "${path.basename(converting[1])}" ` +
          `would both be written to ${output}. Convert them separately.`,
      );
    }

    // Everything but one claimant stands to be overwritten: either the file at
    // the output path, or duplicates of a path listed more than once.
    for (const file of claimants.slice(converting.length === 1 ? 0 : 1)) {
      if (path.resolve(file) === output || converting.length === 0) {
        overwritten.add(file);
      }
    }
  }

  return {
    planned: files.filter((file) => !overwritten.has(file)),
    skipped: overwritten.size,
  };
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
  const { format, concurrency } = { ...DEFAULT_OPTIONS, ...options };

  const { planned, skipped } = planRun(files, format);

  const summary = {
    total: files.length,
    optimized: 0,
    skipped,
    failed: 0,
    deleted: 0,
    originalSize: 0,
    newSize: 0,
    failures: [],
  };

  let completed = 0;

  const outcomes = await runPool(planned, concurrency, async (file) => {
    let outcome;

    try {
      outcome = { result: await optimizeImage(file, options) };
    } catch (error) {
      outcome = { error };
      onFailure(file, error);
    }

    onProgress(++completed, planned.length);
    return outcome;
  });

  for (const [index, { result, error }] of outcomes.entries()) {
    if (error) {
      summary.failed++;
      summary.failures.push({ file: planned[index], message: error.message });
      continue;
    }

    summary.optimized++;
    summary.originalSize += result.originalSize;
    summary.newSize += result.newSize;
    if (result.deleted) summary.deleted++;
  }

  return summary;
}

module.exports = { optimizeImages };
