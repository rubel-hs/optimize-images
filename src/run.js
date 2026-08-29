"use strict";

const fs = require("fs/promises");

const { DEFAULT_OPTIONS } = require("./defaults");
const { encodeImage } = require("./encode");
const { planJobs } = require("./plan");
const { runPool } = require("./pool");
const { UserError } = require("./errors");

const noop = () => {};

async function prepareOutputDirs(outputRoot, outputDirs) {
  let stats = null;
  try {
    stats = await fs.stat(outputRoot);
  } catch {
    // Does not exist yet — mkdir below creates it.
  }
  if (stats && !stats.isDirectory()) {
    throw new UserError(`Output path is not a directory: ${outputRoot}`);
  }
  for (const dir of outputDirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

/**
 * Optimize every file: plan the jobs, create the output folders, run the
 * encoders through the pool and fold the outcomes into one summary. One broken
 * image is reported through onFailure and skipped rather than aborting.
 */
async function optimizeImages(files, options = {}, handlers = {}) {
  const { onProgress = noop, onFailure = noop } = handlers;
  const merged = { ...DEFAULT_OPTIONS, ...options };

  if (merged.inPlace && merged.output) {
    throw new UserError("--in-place cannot be combined with an output directory.");
  }
  if (!merged.inPlace && !merged.inputRoot) {
    throw new UserError("inputRoot is required unless inPlace is set.");
  }

  const { jobs, skipped, outputDirs, outputRoot } = planJobs(files, merged);

  if (outputRoot) await prepareOutputDirs(outputRoot, outputDirs);

  const summary = {
    total: files.length,
    optimized: 0,
    copied: 0,
    skipped,
    failed: 0,
    originalSize: 0,
    newSize: 0,
    failures: [],
    outputDir: outputRoot,
  };

  let completed = 0;

  const outcomes = await runPool(jobs, merged.concurrency, async (job) => {
    let outcome;
    try {
      outcome = { result: await encodeImage(job, merged) };
    } catch (error) {
      outcome = { error };
      onFailure(job.source, error);
    }
    onProgress(++completed, jobs.length);
    return outcome;
  });

  for (const [index, { result, error }] of outcomes.entries()) {
    if (error) {
      summary.failed++;
      summary.failures.push({ file: jobs[index].source, message: error.message });
      continue;
    }
    if (result.action === "copied") summary.copied++;
    else summary.optimized++;
    summary.originalSize += result.originalSize;
    summary.newSize += result.newSize;
  }

  return summary;
}

module.exports = { optimizeImages };
