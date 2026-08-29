"use strict";

const os = require("os");

const { KEEP_ORIGINAL_FORMAT } = require("./formats");

const QUALITY_MIN = 1;
const QUALITY_MAX = 100;

const CONCURRENCY_MIN = 1;

/** libuv will not grow its thread pool past this, so neither will we. */
const CONCURRENCY_MAX = 1024;

/**
 * libvips is pinned to one thread per image on several platforms, so the only
 * way to fill the machine is to encode several images at once.
 *
 * Read per machine rather than baked in: a laptop, a 128-core build server and a
 * CI container pinned to one CPU all want different numbers. Node's own count
 * follows CPU affinity and cgroup limits, which `os.cpus().length` does not —
 * inside a one-CPU container that still reports every core on the host.
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
