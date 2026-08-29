"use strict";

const path = require("path");

const { OUTPUT_DIR_SUFFIX } = require("./discover");
const { UserError } = require("./errors");
const {
  KEEP_ORIGINAL_FORMAT,
  outputExtensionFor,
  resolveOutputFormat,
} = require("./formats");

/** Where a run writes: null in place, else the -o dir, else the -oi-out sibling. */
function resolveOutputRoot(inputRoot, { output = null, inPlace = false } = {}) {
  if (inPlace) return null;
  if (output) return path.resolve(output);
  return `${path.resolve(inputRoot)}${OUTPUT_DIR_SUFFIX}`;
}

function swapExtension(filePath, format) {
  const base = path.basename(filePath, path.extname(filePath));
  return path.join(path.dirname(filePath), `${base}${outputExtensionFor(format)}`);
}

function outputPathFor(source, outputFormat, requestedFormat, inputRoot, outputRoot) {
  const location = outputRoot
    ? path.join(outputRoot, path.relative(inputRoot, source))
    : source;
  return requestedFormat === KEEP_ORIGINAL_FORMAT
    ? location
    : swapExtension(location, outputFormat);
}

/**
 * What to do when the encode comes back no smaller than the source:
 * overwrite-in-place keeps the source, an out-of-place same-format job copies
 * the source (the output folder stays a complete mirror), and a conversion or
 * resize writes regardless — the caller asked for that format or size.
 */
function whenLargerAction(source, outputPath, outputFormat, { inPlace, size }) {
  if (size) return "write";
  if (inPlace) return source === outputPath ? "keep" : "write";
  const sameFormat = resolveOutputFormat(source, KEEP_ORIGINAL_FORMAT) === outputFormat;
  return sameFormat ? "copy" : "write";
}

/**
 * Turn discovered files into encode jobs with the output path decided.
 *
 * Collision rules, checked before any write:
 * 1. Two different sources mapping to one output path is an error.
 * 2. A source that already IS another job's output (in-place conversion with
 *    the converted file present) has its own job dropped and counted skipped.
 */
function planJobs(files, options) {
  const { inputRoot, format, inPlace, size } = options;
  const outputRoot = resolveOutputRoot(inputRoot, options);
  const resolvedRoot = inputRoot ? path.resolve(inputRoot) : null;

  const seen = new Set();
  const jobs = [];
  let skipped = 0;

  for (const file of files) {
    const source = path.resolve(file);
    if (seen.has(source)) {
      skipped++;
      continue;
    }
    seen.add(source);

    const outputFormat = resolveOutputFormat(source, format);
    const outputPath = outputPathFor(source, outputFormat, format, resolvedRoot, outputRoot);

    jobs.push({
      source,
      outputPath,
      format: outputFormat,
      whenLarger: whenLargerAction(source, outputPath, outputFormat, { inPlace, size }),
    });
  }

  const byOutput = new Map();
  for (const job of jobs) {
    const claimants = byOutput.get(job.outputPath) || [];
    claimants.push(job);
    byOutput.set(job.outputPath, claimants);
  }

  const dropped = new Set();
  for (const [outputPath, claimants] of byOutput) {
    if (claimants.length === 1) continue;

    const converting = claimants.filter((job) => job.source !== outputPath);
    if (converting.length > 1) {
      throw new UserError(
        `"${path.basename(converting[0].source)}" and "${path.basename(converting[1].source)}" ` +
          `would both be written to ${outputPath}. Convert them separately.`,
      );
    }

    for (const job of claimants) {
      if (job.source === outputPath) {
        dropped.add(job);
        skipped++;
      }
    }
  }

  const planned = jobs.filter((job) => !dropped.has(job));
  const outputDirs = outputRoot
    ? [...new Set(planned.map((job) => path.dirname(job.outputPath)))]
    : [];

  return { jobs: planned, skipped, outputDirs, outputRoot };
}

module.exports = { planJobs, resolveOutputRoot };
