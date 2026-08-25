"use strict";

const path = require("path");
const chalk = require("chalk");
const cliProgress = require("cli-progress");

const { formatBytes } = require("../format-bytes");
const { KEEP_ORIGINAL_FORMAT } = require("../formats");

/** Everything the CLI prints lives here, so the core stays terminal-agnostic. */

function printError(message) {
  console.error(chalk.red(`Error: ${message}`));
}

function printFatal(message) {
  console.error(chalk.red(`Fatal: ${message}`));
}

function printRunHeader(targetPath, fileCount, options) {
  console.log();
  console.log(chalk.bold.cyan("  oi — Optimize Images"));
  console.log(chalk.dim("  ─────────────────────"));
  console.log(`  ${chalk.dim("Path:")}     ${targetPath}`);
  console.log(`  ${chalk.dim("Images:")}   ${fileCount}`);
  console.log(`  ${chalk.dim("Quality:")}  ${options.quality}`);
  console.log(
    `  ${chalk.dim("Format:")}   ${options.format}${
      options.format === KEEP_ORIGINAL_FORMAT ? " (keep)" : ""
    }`,
  );
  console.log(`  ${chalk.dim("Workers:")}  ${options.concurrency}`);
  if (options.size) {
    console.log(
      `  ${chalk.dim("Resize:")}   ${options.size.width}×${options.size.height}`,
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
    chalk.dim(`\n  ⚠ ${path.basename(file)}: ${error.message}\n`),
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
    console.log(chalk.yellow(`  ${summary.failed} file(s) had errors.`));
  }
  console.log(`  ${chalk.green("✓")} ${summary.optimized} image(s) optimized`);
  if (summary.deleted > 0) {
    console.log(`  ${chalk.dim("Deleted:")} ${summary.deleted} source file(s)`);
  }
  console.log(
    `  ${chalk.dim("Before:")} ${formatBytes(summary.originalSize)}  →  ${chalk.dim("After:")} ${formatBytes(summary.newSize)}`,
  );

  if (saved > 0) {
    console.log(
      `  ${chalk.bold.green(`Saved: ${formatBytes(saved)} (${savedPercent}%)`)}`,
    );
  } else if (saved < 0) {
    console.log(
      `  ${chalk.yellow(`Size increased by: ${formatBytes(Math.abs(saved))} (consider lower quality)`)}`,
    );
  } else {
    console.log(`  ${chalk.dim("No size change.")}`);
  }
  console.log();
}

module.exports = {
  createProgressBar,
  printError,
  printFatal,
  printFileFailure,
  printRunHeader,
  printSummary,
};
