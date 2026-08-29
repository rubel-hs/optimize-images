"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { runPool } = require("../src/pool");

/** Resolves only once every worker that will ever run has started. */
function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("runPool", () => {
  it("keeps `limit` workers busy at once", async () => {
    let inFlight = 0;
    let peak = 0;

    await runPool([1, 2, 3, 4, 5, 6], 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight--;
    });

    assert.equal(peak, 3);
  });

  it("never runs more than `limit` at once", async () => {
    let inFlight = 0;
    let peak = 0;

    await runPool([1, 2, 3, 4, 5, 6, 7, 8], 2, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight--;
    });

    assert.equal(peak, 2);
  });

  it("returns results in input order however the work interleaves", async () => {
    const delays = [40, 0, 20, 5];

    const results = await runPool(delays, 4, async (delay, index) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return index;
    });

    assert.deepEqual(results, [0, 1, 2, 3]);
  });

  it("does not start more workers than there are items", async () => {
    let started = 0;

    await runPool([1, 2], 8, async () => {
      started++;
      await tick();
    });

    assert.equal(started, 2);
  });

  it("handles an empty list", async () => {
    assert.deepEqual(await runPool([], 4, async () => "never"), []);
  });

  it("lets a rejecting worker reject the whole run", async () => {
    await assert.rejects(
      runPool([1, 2], 2, async () => {
        throw new Error("boom");
      }),
      /boom/,
    );
  });

  it("starts no further work once the signal aborts", async () => {
    const controller = new AbortController();
    const started = [];

    const results = await runPool(
      [1, 2, 3, 4, 5, 6],
      1,
      async (item) => {
        started.push(item);
        if (item === 2) controller.abort();
        await tick();
        return item;
      },
      controller.signal,
    );

    assert.deepEqual(started, [1, 2]);
    assert.deepEqual(results.slice(0, 2), [1, 2]);
    // The jobs that never ran leave holes rather than fabricated results.
    assert.equal(results.length, 6);
    assert.equal(results[2], undefined);
    assert.equal(results.filter(() => true).length, 2);
  });

  it("lets an in-flight worker finish after an abort", async () => {
    const controller = new AbortController();
    let finished = false;

    await runPool(
      [1, 2],
      2,
      async () => {
        controller.abort();
        await tick();
        finished = true;
      },
      controller.signal,
    );

    assert.equal(finished, true);
  });
});
