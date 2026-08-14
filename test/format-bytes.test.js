"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { formatBytes } = require("../src/format-bytes");

describe("formatBytes", () => {
  it("reports zero without a decimal", () => {
    assert.equal(formatBytes(0), "0 B");
  });

  it("keeps small values in bytes", () => {
    assert.equal(formatBytes(512), "512 B");
  });

  it("steps up a unit at 1024", () => {
    assert.equal(formatBytes(1024), "1 KB");
    assert.equal(formatBytes(1536), "1.5 KB");
  });

  it("handles megabytes and gigabytes", () => {
    assert.equal(formatBytes(1024 ** 2), "1 MB");
    assert.equal(formatBytes(1024 ** 3), "1 GB");
    assert.equal(formatBytes(2.5 * 1024 ** 2), "2.5 MB");
  });

  it("clamps at the largest known unit instead of returning undefined", () => {
    assert.equal(formatBytes(1024 ** 4), "1024 GB");
  });

  it("rounds to one decimal place", () => {
    assert.equal(formatBytes(1234), "1.2 KB");
  });
});
