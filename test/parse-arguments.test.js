"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  CONCURRENCY_MAX,
  CONCURRENCY_MIN,
  DEFAULT_OPTIONS,
} = require("../src/defaults");
const { UserError } = require("../src/user-error");
const { parseArguments } = require("../src/cli/parse-arguments");

/** parseArguments reads process.argv, so tests skip the two leading entries. */
const parse = (...args) => parseArguments(["node", "oi", ...args]);

const expectUserError = (message, ...args) =>
  assert.throws(() => parse(...args), (error) => {
    assert.ok(error instanceof UserError, `expected UserError, got ${error.name}`);
    assert.match(error.message, message);
    return true;
  });

describe("parseArguments help", () => {
  it("asks for help when given nothing", () => {
    assert.equal(parse().helpRequested, true);
  });

  it("asks for help on -h or --help anywhere in the arguments", () => {
    assert.equal(parse("-h").helpRequested, true);
    assert.equal(parse("--help").helpRequested, true);
    assert.equal(parse("./images", "-q", "60", "--help").helpRequested, true);
  });
});

describe("parseArguments options", () => {
  it("applies the shared defaults", () => {
    const { path, helpRequested, ...options } = parse("./images");
    assert.equal(path, "./images");
    assert.equal(helpRequested, false);
    assert.deepEqual(options, DEFAULT_OPTIONS);
  });

  it("reads quality in short and long form", () => {
    assert.equal(parse("./images", "-q", "60").quality, 60);
    assert.equal(parse("./images", "--quality", "1").quality, 1);
    assert.equal(parse("./images", "--quality", "100").quality, 100);
  });

  it("normalises the requested format", () => {
    assert.equal(parse("./images", "-f", "webp").format, "webp");
    assert.equal(parse("./images", "--format", "JPEG").format, "jpg");
    assert.equal(parse("./images", "-f", "original").format, "original");
  });

  it("reads size as width and height", () => {
    assert.deepEqual(parse("./images", "-s", "800x600").size, {
      width: 800,
      height: 600,
    });
    assert.deepEqual(parse("./images", "--size", "400X400").size, {
      width: 400,
      height: 400,
    });
  });

  it("treats delete-original as a boolean flag", () => {
    assert.equal(parse("./images", "-d").deleteOriginal, true);
    assert.equal(parse("./images", "--delete-original").deleteOriginal, true);
  });

  it("accepts flags before the path and in any order", () => {
    const options = parse("-q", "55", "-f", "avif", "./images", "-d");
    assert.equal(options.path, "./images");
    assert.equal(options.quality, 55);
    assert.equal(options.format, "avif");
    assert.equal(options.deleteOriginal, true);
  });

  it("reads concurrency in short and long form", () => {
    assert.equal(parse("./images", "-j", "3").concurrency, 3);
    assert.equal(parse("./images", "--concurrency", "12").concurrency, 12);
  });

  it("lets a later flag win over an earlier one", () => {
    assert.equal(parse("./images", "-q", "30", "-q", "90").quality, 90);
  });
});

describe("parseArguments rejections", () => {
  it("rejects a missing path", () => {
    expectUserError(/No image path provided/, "-q", "60");
  });

  it("rejects a second path", () => {
    expectUserError(/Only one path allowed/, "./a", "./b");
  });

  it("rejects an unknown flag", () => {
    expectUserError(/Unknown flag "--zap"/, "./images", "--zap");
  });

  it("rejects quality outside 1-100", () => {
    expectUserError(/Quality must be a number between 1-100/, "./images", "-q", "0");
    expectUserError(/Quality must be a number between 1-100/, "./images", "-q", "101");
    expectUserError(/Quality must be a number between 1-100/, "./images", "-q", "abc");
  });

  it("rejects an unsupported format and lists the valid ones", () => {
    expectUserError(/Unsupported format "bmp".*webp/s, "./images", "-f", "bmp");
  });

  it("rejects a malformed size", () => {
    expectUserError(/Size must be in WxH format/, "./images", "-s", "600");
    expectUserError(/Size must be in WxH format/, "./images", "-s", "600*300");
  });

  it(`rejects concurrency outside ${CONCURRENCY_MIN}-${CONCURRENCY_MAX}`, () => {
    expectUserError(/Concurrency must be/, "./images", "-j", "0");
    expectUserError(/Concurrency must be/, "./images", "-j", String(CONCURRENCY_MAX + 1));
    expectUserError(/Concurrency must be/, "./images", "-j", "lots");
  });

  it("rejects a flag whose value is missing", () => {
    expectUserError(/Missing value for "-q"/, "./images", "-q");
    expectUserError(/Missing value for "--format"/, "./images", "--format");
  });
});
