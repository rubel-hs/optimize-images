"use strict";

const path = require("path");
const { styleText } = require("util");
const cliProgress = require("cli-progress");

const { KEEP_ORIGINAL_FORMAT } = require("../formats");

/** Everything the CLI prints lives here, so the core stays terminal-agnostic. */

/** Color only for real terminals, and never when NO_COLOR is set. */
function paint(styles, text) {
  if (!process.stdout.isTTY || process.env.NO_COLOR) return text;
  return styleText(styles, text);
}

const UNITS = ["B", "KB", "MB", "GB"];

/** 1536 -> "1.5 KB" */
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    UNITS.length - 1,
  );
  return `${parseFloat((bytes / 1024 ** unitIndex).toFixed(1))} ${UNITS[unitIndex]}`;
}

function printError(message) {
  console.error(paint("red", `Error: ${message}`));
}

function printFatal(message) {
  console.error(paint("red", `Fatal: ${message}`));
}

function printRunHeader(targetPath, fileCount, options, outputRoot) {
  console.log();
  console.log(paint(["bold", "cyan"], "  oi — Optimize Images"));
  console.log(paint("dim", "  ─────────────────────"));
  console.log(`  ${paint("dim", "Path:")}     ${targetPath}`);
  console.log(
    `  ${paint("dim", "Output:")}   ${outputRoot || "in place (originals overwritten)"}`,
  );
  console.log(`  ${paint("dim", "Images:")}   ${fileCount}`);
  console.log(`  ${paint("dim", "Quality:")}  ${options.quality}`);
  console.log(
    `  ${paint("dim", "Format:")}   ${options.format}${
      options.format === KEEP_ORIGINAL_FORMAT ? " (keep)" : ""
    }`,
  );
  console.log(`  ${paint("dim", "Workers:")}  ${options.concurrency}`);
  if (options.size) {
    console.log(
      `  ${paint("dim", "Resize:")}   ${options.size.width}×${options.size.height}`,
    );
  }
  console.log();
}

function createProgressBar(total) {
  const bar = new cliProgress.SingleBar(
    {
      format: `  {bar} {percentage}% | {value}/{total} files`,
      barCompleteChar: "█",
      barIncompleteChar: "░",
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic,
  );

  bar.start(total, 0);
  return bar;
}

/** Written to stderr so it survives above the progress bar. */
function printFileFailure(file, error) {
  process.stderr.write(
    paint("dim", `\n  ⚠ ${path.basename(file)}: ${error.message}\n`),
  );
}

function printSummary(summary) {
  const saved = summary.originalSize - summary.newSize;
  const savedPercent =
    summary.originalSize > 0
      ? ((saved / summary.originalSize) * 100).toFixed(1)
      : 0;

  console.log();
  if (summary.failed > 0) {
    console.log(paint("yellow", `  ${summary.failed} file(s) had errors.`));
  }
  console.log(`  ${paint("green", "✓")} ${summary.optimized} image(s) optimized`);
  if (summary.copied > 0) {
    console.log(
      `  ${paint("dim", "Copied as-is:")} ${summary.copied} file(s) were already smaller than a re-encode`,
    );
  }
  if (summary.skipped > 0) {
    console.log(`  ${paint("dim", "Left alone:")} ${summary.skipped} file(s)`);
  }
  if (summary.outputDir) {
    console.log(`  ${paint("dim", "Output:")} ${summary.outputDir}`);
  }
  console.log(
    `  ${paint("dim", "Before:")} ${formatBytes(summary.originalSize)}  →  ${paint("dim", "After:")} ${formatBytes(summary.newSize)}`,
  );

  if (saved > 0) {
    console.log(
      `  ${paint(["bold", "green"], `Saved: ${formatBytes(saved)} (${savedPercent}%)`)}`,
    );
  } else if (saved < 0) {
    console.log(
      `  ${paint("yellow", `Size increased by: ${formatBytes(Math.abs(saved))} (consider lower quality)`)}`,
    );
  } else {
    console.log(`  ${paint("dim", "No size change.")}`);
  }
  console.log();
}

module.exports = {
  createProgressBar,
  formatBytes,
  paint,
  printError,
  printFatal,
  printFileFailure,
  printRunHeader,
  printSummary,
};
