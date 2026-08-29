"use strict";

const { DEFAULT_OPTIONS } = require("../defaults");

/** libuv's own default. Never go below it, whatever the machine looks like. */
const MINIMUM_THREAD_POOL = 4;

/**
 * libuv reads UV_THREADPOOL_SIZE the first time work is queued, so it must be
 * set before sharp loads — hence the late require below.
 *
 * sharp's cache is disabled because each file is visited once.
 */
function tuneRuntime(env = process.env) {
  if (!env.UV_THREADPOOL_SIZE) {
    env.UV_THREADPOOL_SIZE = String(
      Math.max(MINIMUM_THREAD_POOL, DEFAULT_OPTIONS.concurrency),
    );
  }

  require("sharp").cache(false);

  return env;
}

module.exports = { tuneRuntime };
