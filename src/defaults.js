"use strict";

const { KEEP_ORIGINAL_FORMAT } = require("./formats");

const QUALITY_MIN = 1;
const QUALITY_MAX = 100;

/** Applied by both the argument parser and the programmatic API. */
const DEFAULT_OPTIONS = {
  quality: 80,
  format: KEEP_ORIGINAL_FORMAT,
  size: null,
  deleteOriginal: false,
};

module.exports = { DEFAULT_OPTIONS, QUALITY_MIN, QUALITY_MAX };
