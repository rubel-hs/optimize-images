"use strict";

const fs = require("fs/promises");
const path = require("path");

const { DEFAULT_OPTIONS } = require("./defaults");
const { encodeImage } = require("./encode");
const { KEEP_ORIGINAL_FORMAT, normalizeFormatName, REQUESTABLE_FORMATS } = require("./formats");
const { planJobs, resolveOutputRoot } = require("./plan");
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
 * Resolve as much of a path as actually exists on disk, then re-append the
 * suffix that doesn't exist yet (an output dir not yet created, typically).
 * Resolving only the real part is enough to see through a symlink or a
 * case-insensitive filesystem alias on the existing ancestor.
 */
async function realpathExistingPrefix(targetPath) {
  const missingSegments = [];
  let current = path.resolve(targetPath);

  for (;;) {
    try {
      const real = await fs.realpath(current);
      return path.join(real, ...missingSegments);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error; // reached the filesystem root, still missing
      missingSegments.unshift(path.basename(current));
      current = parent;
    }
  }
}

/**
 * Guard against an out-of-place output that is really the input in disguise:
 * a symlink or case alias of it, or a folder nested inside it. Both would
 * otherwise re-encode discovered sources as if they were plain output, and
 * a nested output would also grow unboundedly across repeated runs. This is
 * the real check; plan.js's per-file `source === outputPath` string compare
 * stays in place too as a cheap second net.
 */
async function assertOutputDoesNotOverlapInput(inputRoot, outputRoot) {
  const [realInput, realOutput] = await Promise.all([
    realpathExistingPrefix(inputRoot),
    realpathExistingPrefix(outputRoot),
  ]);

  const relative = path.relative(realInput, realOutput);
  const nested = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));

  if (nested) {
    throw new UserError(
      "Output folder overlaps the source folder. Choose a different -o directory, " +
        "or use --in-place to overwrite originals.",
    );
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

  if (merged.format === undefined || merged.format === null) {
    merged.format = DEFAULT_OPTIONS.format;
  }
  if (merged.format !== KEEP_ORIGINAL_FORMAT && !normalizeFormatName(merged.format)) {
    throw new UserError(
      `Unsupported format "${merged.format}". Valid: ${REQUESTABLE_FORMATS.join(", ")}`,
    );
  }

  if (merged.inPlace && merged.output) {
    throw new UserError("--in-place cannot be combined with an output directory.");
  }
  if (!merged.inPlace && !merged.inputRoot) {
    throw new UserError("inputRoot is required unless inPlace is set.");
  }

  if (!merged.inPlace) {
    const candidateOutputRoot = resolveOutputRoot(merged.inputRoot, merged);
    await assertOutputDoesNotOverlapInput(merged.inputRoot, candidateOutputRoot);
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
