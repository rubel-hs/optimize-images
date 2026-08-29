"use strict";

const path = require("path");
const { styleText } = require("util");
const cliProgress = require("cli-progress");

const { KEEP_ORIGINAL_FORMAT } = require("../formats");
const { version } = require("../../package.json");

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

/** 90000 -> "1m 30s" */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m ${seconds}s`;
}

function printError(message) {
  console.error(paint("red", `Error: ${message}`));
}

function printFatal(message) {
  console.error(paint("red", `Fatal: ${message}`));
}

function printVersion() {
  console.log(version);
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

/**
 * A wave of dots travelling from the top left to the bottom right.
 *
 * Each braille glyph is a 2×4 dot grid, so five of them give a 10×4 canvas —
 * enough resolution for a sine wave riding a downward slope. A column whose
 * wave height lands between two dot rows lights both, which smooths the step
 * from one row to the next.
 */
const SPINNER_CELLS = 5;
const SPINNER_COLUMNS = SPINNER_CELLS * 2;
const SPINNER_ROWS = 4;
const SPINNER_INTERVAL_MS = 80;

/** Dot bit values within one braille cell, as [column][row]. */
const BRAILLE_DOTS = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
];

/** Two phase steps per column, so no two consecutive frames look alike. */
const SPINNER_FRAME_COUNT = SPINNER_COLUMNS * 2;

function spinnerRows(column, frame) {
  const slope = 0.3 + (column / (SPINNER_COLUMNS - 1)) * 2.4;
  const wave =
    1.15 *
    Math.sin(
      ((column / SPINNER_COLUMNS) * 1.25 - frame / SPINNER_FRAME_COUNT) *
        2 *
        Math.PI,
    );
  const height = Math.min(SPINNER_ROWS - 1, Math.max(0, slope + wave));
  const row = Math.floor(height);
  const fraction = height - row;

  return fraction > 0.42 && fraction < 0.58 && row + 1 < SPINNER_ROWS
    ? [row, row + 1]
    : [Math.round(height)];
}

const SPINNER_FRAMES = Array.from({ length: SPINNER_FRAME_COUNT }, (_, frame) => {
  const cells = new Array(SPINNER_CELLS).fill(0);
  for (let column = 0; column < SPINNER_COLUMNS; column++) {
    for (const row of spinnerRows(column, frame)) {
      cells[Math.floor(column / 2)] |= BRAILLE_DOTS[column % 2][row];
    }
  }
  return cells.map((bits) => String.fromCharCode(0x2800 + bits)).join("");
});

function createProgressBar(total) {
  const bar = new cliProgress.SingleBar(
    {
      format: `  {spinner} {bar} {percentage}% | {value}/{total} files`,
      barCompleteChar: "█",
      barIncompleteChar: "░",
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic,
  );

  bar.start(total, 0, { spinner: SPINNER_FRAMES[0] });

  let frameIndex = 0;
  const spin = setInterval(() => {
    frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
    bar.update(bar.value, { spinner: SPINNER_FRAMES[frameIndex] });
  }, SPINNER_INTERVAL_MS);
  spin.unref();

  // stop() only ever runs once, from cli/index.js's finally block — wrapping
  // it here is the one place that's guaranteed to run, success or failure.
  const stop = bar.stop.bind(bar);
  bar.stop = () => {
    clearInterval(spin);
    stop();
  };

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
  console.log(`  ${paint("dim", "Time:")} ${formatDuration(summary.durationMs)}`);
  console.log();
}

module.exports = {
  createProgressBar,
  formatBytes,
  formatDuration,
  paint,
  printError,
  printFatal,
  printFileFailure,
  printRunHeader,
  printSummary,
  printVersion,
};
