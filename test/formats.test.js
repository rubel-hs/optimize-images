"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  FORMAT_NAMES,
  KEEP_ORIGINAL_FORMAT,
  REQUESTABLE_FORMATS,
  isSupportedImage,
  normalizeFormatName,
  outputExtensionFor,
  resolveOutputFormat,
} = require("../src/formats");

describe("normalizeFormatName", () => {
  it("accepts every canonical name", () => {
    for (const name of FORMAT_NAMES) {
      assert.equal(normalizeFormatName(name), name);
    }
  });

  it("passes through the keep-original sentinel", () => {
    assert.equal(normalizeFormatName(KEEP_ORIGINAL_FORMAT), KEEP_ORIGINAL_FORMAT);
  });

  it("folds aliases onto their canonical name", () => {
    assert.equal(normalizeFormatName("jpeg"), "jpg");
    assert.equal(normalizeFormatName("tif"), "tiff");
  });

  it("is case insensitive", () => {
    assert.equal(normalizeFormatName("WebP"), "webp");
    assert.equal(normalizeFormatName("JPEG"), "jpg");
  });

  it("returns null for anything unknown", () => {
    assert.equal(normalizeFormatName("bmp"), null);
    assert.equal(normalizeFormatName(""), null);
  });
});

describe("isSupportedImage", () => {
  it("recognises supported extensions regardless of case", () => {
    assert.equal(isSupportedImage("/x/a.jpg"), true);
    assert.equal(isSupportedImage("/x/a.JPEG"), true);
    assert.equal(isSupportedImage("/x/a.TIF"), true);
  });

  it("rejects everything else", () => {
    assert.equal(isSupportedImage("/x/a.txt"), false);
    assert.equal(isSupportedImage("/x/a"), false);
  });
});

describe("resolveOutputFormat", () => {
  it("maps each file back to its own format when keeping originals", () => {
    assert.equal(resolveOutputFormat("/x/a.png", KEEP_ORIGINAL_FORMAT), "png");
    assert.equal(resolveOutputFormat("/x/a.jpeg", KEEP_ORIGINAL_FORMAT), "jpg");
    assert.equal(resolveOutputFormat("/x/a.TIF", KEEP_ORIGINAL_FORMAT), "tiff");
  });

  it("falls back to jpg for an unmapped extension", () => {
    assert.equal(resolveOutputFormat("/x/a.txt", KEEP_ORIGINAL_FORMAT), "jpg");
  });

  it("uses the requested format when one is given", () => {
    assert.equal(resolveOutputFormat("/x/a.png", "webp"), "webp");
    assert.equal(resolveOutputFormat("/x/a.png", "jpeg"), "jpg");
  });
});

describe("outputExtensionFor", () => {
  it("returns the canonical extension for a format", () => {
    assert.equal(outputExtensionFor("jpg"), ".jpg");
    assert.equal(outputExtensionFor("tiff"), ".tiff");
    assert.equal(outputExtensionFor("webp"), ".webp");
  });
});

describe("derived constants", () => {
  it("offers every canonical name and alias to --format", () => {
    assert.ok(REQUESTABLE_FORMATS.includes(KEEP_ORIGINAL_FORMAT));
    for (const name of [...FORMAT_NAMES, "jpeg", "tif"]) {
      assert.ok(REQUESTABLE_FORMATS.includes(name), `missing ${name}`);
    }
  });
});
