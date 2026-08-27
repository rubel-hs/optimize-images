"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const oi = require("../src/index");
const defaults = require("../src/defaults");

describe("public API", () => {
  it("exposes the bounds for every option it validates", () => {
    assert.equal(oi.QUALITY_MIN, defaults.QUALITY_MIN);
    assert.equal(oi.QUALITY_MAX, defaults.QUALITY_MAX);
    assert.equal(oi.CONCURRENCY_MIN, defaults.CONCURRENCY_MIN);
    assert.equal(oi.CONCURRENCY_MAX, defaults.CONCURRENCY_MAX);
  });

  it("leaves nothing in the export list undefined", () => {
    const missing = Object.entries(oi)
      .filter(([, value]) => value === undefined)
      .map(([name]) => name);

    assert.deepEqual(missing, []);
  });
});
