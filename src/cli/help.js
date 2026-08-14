"use strict";

const chalk = require("chalk");

const { DEFAULT_OPTIONS, QUALITY_MAX, QUALITY_MIN } = require("../defaults");
const { FORMAT_NAMES, KEEP_ORIGINAL_FORMAT } = require("../formats");

const listedFormats = [KEEP_ORIGINAL_FORMAT, ...FORMAT_NAMES].join(", ");

function printHelp() {
  console.log(`
${chalk.bold.cyan("oi")} ${chalk.dim("— image optimizer CLI")}

${chalk.bold("Usage:")}
  oi <path> [options]

${chalk.bold("Options:")}
  -q, --quality <${QUALITY_MIN}-${QUALITY_MAX}>   Image quality (default: ${DEFAULT_OPTIONS.quality})
  -f, --format <fmt>      Output format: ${listedFormats} (default: ${DEFAULT_OPTIONS.format})
  -s, --size <WxH>        Resize to width x height, e.g. 600x300
  -d, --delete-original   Delete source file after converting to a different format
  -h, --help              Show this help

${chalk.bold("Examples:")}
  oi ./images                          Optimize with defaults (quality ${DEFAULT_OPTIONS.quality}, keep format)
  oi ./images -q 60                    Quality 60, keep format
  oi ./images -f webp                  Convert all to WebP
  oi ./images -q 75 -f original        Quality 75, keep original formats
  oi ./images -q 90 -f png -s 800x600  Convert to PNG, resize to 800x600, quality 90
`);
}

module.exports = { printHelp };
