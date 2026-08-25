"use strict";

const os = require("os");

const { KEEP_ORIGINAL_FORMAT } = require("./formats");

const QUALITY_MIN = 1;
const QUALITY_MAX = 100;

const CONCURRENCY_MIN = 1;
const CONCURRENCY_MAX = 64;

/**
 * libvips is pinned to one thread per image on several platforms, so the only
 * way to fill the machine is to encode several images at once. Node's own count
 * respects cgroup limits and CPU affinity, which `os.cpus().length` does not.
 */
const DEFAULT_CONCURRENCY = Math.min(
  Math.max(os.availableParallelism(), CONCURRENCY_MIN),
  CONCURRENCY_MAX,
);

/** Applied by both the argument parser and the programmatic API. */
const DEFAULT_OPTIONS = {
  quality: 80,
  format: KEEP_ORIGINAL_FORMAT,
  size: null,
  deleteOriginal: false,
  concurrency: DEFAULT_CONCURRENCY,
};

module.exports = {
  CONCURRENCY_MAX,
  CONCURRENCY_MIN,
  DEFAULT_OPTIONS,
  QUALITY_MAX,
  QUALITY_MIN,
};
