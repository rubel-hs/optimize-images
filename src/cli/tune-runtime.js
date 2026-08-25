"use strict";

const { DEFAULT_OPTIONS } = require("../defaults");

/** libuv's own default. Never go below it, whatever the machine looks like. */
const MINIMUM_THREAD_POOL = 4;

/**
 * Point the process at the whole machine before any encoding starts.
 *
 * sharp hands each image to libuv's thread pool, which holds four threads by
 * default — so without this a run asks for eight workers and gets four. libuv
 * reads the variable the first time anything queues work on the pool, and
 * loading sharp's native addon is already enough to do that. Hence the require
 * below the assignment rather than at the top of the file: pull sharp in first
 * and the setting arrives too late to have any effect.
 *
 * sharp's operation cache is turned off in the same breath: a run visits every
 * file once, so the cache cannot hit, and it would sit on memory and open file
 * descriptors that the workers want instead.
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
