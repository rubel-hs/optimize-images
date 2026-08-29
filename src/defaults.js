"use strict";

const os = require("os");

const { KEEP_ORIGINAL_FORMAT } = require("./formats");

const QUALITY_MIN = 1;
const QUALITY_MAX = 100;

const CONCURRENCY_MIN = 1;

/** libuv will not grow its thread pool past this, so neither will we. */
const CONCURRENCY_MAX = 1024;

/** os.availableParallelism() follows CPU affinity and cgroup limits, unlike os.cpus(). */
const DEFAULT_CONCURRENCY = Math.min(
  Math.max(os.availableParallelism(), CONCURRENCY_MIN),
  CONCURRENCY_MAX,
);

/** Applied by both the argument parser and the programmatic API. */
const DEFAULT_OPTIONS = {
  quality: 80,
  format: KEEP_ORIGINAL_FORMAT,
  size: null,
  concurrency: DEFAULT_CONCURRENCY,
  inPlace: false,
  output: null,
  inputRoot: null,
};

module.exports = {
  CONCURRENCY_MAX,
  CONCURRENCY_MIN,
  DEFAULT_OPTIONS,
  QUALITY_MAX,
  QUALITY_MIN,
};
