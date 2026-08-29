"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { parseArguments } = require("../src/cli/args");
const { DEFAULT_OPTIONS } = require("../src/defaults");
const { UserError } = require("../src/errors");

const parse = (...args) => parseArguments(["node", "oi", ...args]);

test("a bare path gets the defaults", () => {
  const options = parse("./images");
  assert.equal(options.path, "./images");
  assert.equal(options.helpRequested, false);
  assert.equal(options.quality, DEFAULT_OPTIONS.quality);
  assert.equal(options.format, DEFAULT_OPTIONS.format);
  assert.equal(options.inPlace, false);
  assert.equal(options.output, null);
});

test("no arguments or -h requests help", () => {
  assert.equal(parse().helpRequested, true);
  assert.equal(parse("-h").helpRequested, true);
  assert.equal(parse("./images", "--help").helpRequested, true);
});

test("quality, format, size, concurrency parse as before", () => {
  const options = parse("./images", "-q", "60", "-f", "webp", "-s", "600x300", "-j", "2");
  assert.equal(options.quality, 60);
  assert.equal(options.format, "webp");
  assert.deepEqual(options.size, { width: 600, height: 300 });
  assert.equal(options.concurrency, 2);
});

test("-o and --output set the output directory", () => {
  assert.equal(parse("./images", "-o", "./optimized").output, "./optimized");
  assert.equal(parse("./images", "--output", "out").output, "out");
});

test("--in-place is parsed", () => {
  assert.equal(parse("./images", "--in-place").inPlace, true);
});

test("--in-place with -o is rejected", () => {
  assert.throws(() => parse("./images", "--in-place", "-o", "out"), UserError);
});

test("the removed -d flag explains the new model", () => {
  for (const flag of ["-d", "--delete-original"]) {
    assert.throws(
      () => parse("./images", flag),
      (error) =>
        error instanceof UserError && /--in-place/.test(error.message),
    );
  }
});

test("unknown flags, missing values and bad values are rejected", () => {
  assert.throws(() => parse("./images", "--nope"), UserError);
  assert.throws(() => parse("./images", "-q"), UserError);
  assert.throws(() => parse("./images", "-q", "101"), UserError);
  assert.throws(() => parse("./images", "-j", "0"), UserError);
  assert.throws(() => parse("./images", "-f", "bmp"), UserError);
  assert.throws(() => parse("./images", "-s", "600"), UserError);
});

test("exactly one path is required", () => {
  assert.throws(() => parse("./a", "./b"), UserError);
  assert.throws(() => parse("-q", "50"), UserError);
});
