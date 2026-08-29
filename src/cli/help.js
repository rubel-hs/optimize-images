"use strict";

const { DEFAULT_OPTIONS, QUALITY_MAX, QUALITY_MIN } = require("../defaults");
const { FORMAT_NAMES, KEEP_ORIGINAL_FORMAT } = require("../formats");
const { paint } = require("./reporter");

const listedFormats = [KEEP_ORIGINAL_FORMAT, ...FORMAT_NAMES].join(", ");

function printHelp() {
  console.log(`
${paint(["bold", "cyan"], "oi")} ${paint("dim", "— image optimizer CLI")}

${paint("bold", "Usage:")}
  oi <path> [options]

By default nothing in <path> is modified: optimized images are written to a
sibling folder named <path>-oi-out.

${paint("bold", "Options:")}
  -q, --quality <${QUALITY_MIN}-${QUALITY_MAX}>   Image quality (default: ${DEFAULT_OPTIONS.quality})
  -f, --format <fmt>      Output format: ${listedFormats} (default: ${DEFAULT_OPTIONS.format})
  -s, --size <WxH>        Resize to fit within width x height, e.g. 600x300
  -j, --concurrency <n>   Images to encode at once (default: ${DEFAULT_OPTIONS.concurrency}, one per core)
  -o, --output <dir>      Write optimized images to <dir> instead of the -oi-out sibling
      --in-place          Overwrite the original files where they are
  -h, --help              Show this help
  -v, --version           Show version number

${paint("bold", "Examples:")}
  oi ./images                    Optimize into ./images-oi-out
  oi ./images -o ./optimized     Optimize into ./optimized
  oi ./images --in-place         Overwrite the files in ./images
  oi ./images -f webp            Convert everything to WebP, into ./images-oi-out
  oi ./photo.jpg                 Optimize one file into the parent's -oi-out sibling
`);
}

module.exports = { printHelp };
