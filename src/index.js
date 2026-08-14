"use strict";

/**
 * Public entry point.
 *
 *   const { findImageFiles, optimizeImages } = require("oi-optimize-images");
 *
 *   const files = await findImageFiles("./images");
 *   const summary = await optimizeImages(files, { quality: 70, format: "webp" });
 *
 * The CLI in `src/cli/` is one consumer of this API, not the other way round.
 */

const { DEFAULT_OPTIONS, QUALITY_MAX, QUALITY_MIN } = require("./defaults");
const { findImageFiles } = require("./find-image-files");
const { formatBytes } = require("./format-bytes");
const {
  FORMAT_NAMES,
  KEEP_ORIGINAL_FORMAT,
  REQUESTABLE_FORMATS,
} = require("./formats");
const { optimizeImage } = require("./optimize-image");
const { optimizeImages } = require("./optimize-images");
const { UserError } = require("./user-error");

module.exports = {
  DEFAULT_OPTIONS,
  FORMAT_NAMES,
  KEEP_ORIGINAL_FORMAT,
  QUALITY_MAX,
  QUALITY_MIN,
  REQUESTABLE_FORMATS,
  UserError,
  findImageFiles,
  formatBytes,
  optimizeImage,
  optimizeImages,
};
