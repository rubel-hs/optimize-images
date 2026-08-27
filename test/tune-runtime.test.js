"use strict";

const assert = require("node:assert/strict");
const path = require("path");
const sharp = require("sharp");
const { spawnSync } = require("child_process");
const { describe, it } = require("node:test");

const { DEFAULT_OPTIONS } = require("../src/defaults");
const { tuneRuntime } = require("../src/cli/tune-runtime");

describe("tuneRuntime", () => {
  it("sizes the libuv thread pool for the default concurrency", () => {
    const env = {};

    tuneRuntime(env);

    assert.ok(
      Number(env.UV_THREADPOOL_SIZE) >= DEFAULT_OPTIONS.concurrency,
      `pool of ${env.UV_THREADPOOL_SIZE} cannot serve ${DEFAULT_OPTIONS.concurrency} workers`,
    );
  });

  it("never shrinks the pool below libuv's own default of four", () => {
    const env = {};

    tuneRuntime(env);

    assert.ok(Number(env.UV_THREADPOOL_SIZE) >= 4);
  });

  it("leaves a thread pool size the user chose alone", () => {
    const env = { UV_THREADPOOL_SIZE: "2" };

    tuneRuntime(env);

    assert.equal(env.UV_THREADPOOL_SIZE, "2");
  });

  it("does not load sharp before it has sized the pool", () => {
    // libuv reads UV_THREADPOOL_SIZE the first time anything queues work on the
    // pool, and loading sharp's native addon is enough to do that. Once the
    // module is in the cache the setting is already too late to matter.
    const probe = `
      require(${JSON.stringify(path.join(__dirname, "..", "src", "cli", "tune-runtime"))});
      const loaded = Object.keys(require.cache).filter((id) => id.includes("sharp"));
      process.stdout.write(JSON.stringify(loaded.length));
    `;

    const { stdout } = spawnSync(process.execPath, ["-e", probe], { encoding: "utf8" });

    assert.equal(stdout, "0", "requiring tune-runtime pulled sharp in with it");
  });

  it("turns off sharp's operation cache, which a one-pass run never hits", () => {
    tuneRuntime({});

    const { memory, files, items } = sharp.cache();
    assert.deepEqual([memory.max, files.max, items.max], [0, 0, 0]);
  });
});
