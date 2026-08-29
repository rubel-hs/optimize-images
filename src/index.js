"use strict";

/**
 * Public entry point.
 *
 *   const { discoverImages, optimizeImages } = require("oi-optimize-images");
 *
 *   const { root, files } = await discoverImages("./images");
 *   const summary = await optimizeImages(files, { inputRoot: root, quality: 70 });
 *
 * By default nothing under inputRoot is modified — output goes to the
 * `${inputRoot}-oi-out` sibling (or `output`); pass `inPlace: true` to
 * overwrite sources. The CLI in `src/cli/` is one consumer of this API.
 */

const {
  CONCURRENCY_MAX,
  CONCURRENCY_MIN,
  DEFAULT_OPTIONS,
  QUALITY_MAX,
  QUALITY_MIN,
} = require("./defaults");
const { discoverImages } = require("./discover");
const {
  FORMAT_NAMES,
  KEEP_ORIGINAL_FORMAT,
  REQUESTABLE_FORMATS,
} = require("./formats");
const { optimizeImages } = require("./run");
const { UserError } = require("./errors");

module.exports = {
  CONCURRENCY_MAX,
  CONCURRENCY_MIN,
  DEFAULT_OPTIONS,
  FORMAT_NAMES,
  KEEP_ORIGINAL_FORMAT,
  QUALITY_MAX,
  QUALITY_MIN,
  REQUESTABLE_FORMATS,
  UserError,
  discoverImages,
  optimizeImages,
};
