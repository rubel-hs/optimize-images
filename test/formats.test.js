"use strict";

const assert = require("node:assert/strict");
const path = require("path");
const { describe, it } = require("node:test");

const {
  FORMAT_NAMES,
  IMAGE_GLOB_PATTERN,
  KEEP_ORIGINAL_FORMAT,
  REQUESTABLE_FORMATS,
  isSupportedImage,
  normalizeFormatName,
  resolveOutputFormat,
  resolveOutputPath,
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

describe("resolveOutputPath", () => {
  it("writes back over the source when keeping the original format", () => {
    const source = path.join("/x", "a.jpeg");
    assert.equal(resolveOutputPath(source, KEEP_ORIGINAL_FORMAT), source);
  });

  it("swaps the extension when converting", () => {
    assert.equal(
      resolveOutputPath(path.join("/x", "a.png"), "webp"),
      path.join("/x", "a.webp"),
    );
  });

  it("normalises alias extensions", () => {
    assert.equal(
      resolveOutputPath(path.join("/x", "a.jpeg"), "jpeg"),
      path.join("/x", "a.jpg"),
    );
    assert.equal(
      resolveOutputPath(path.join("/x", "a.png"), "tif"),
      path.join("/x", "a.tiff"),
    );
  });

  it("keeps the directory and base name", () => {
    assert.equal(
      resolveOutputPath(path.join("/x", "deep", "my.photo.png"), "webp"),
      path.join("/x", "deep", "my.photo.webp"),
    );
  });
});

describe("derived constants", () => {
  it("offers every canonical name and alias to --format", () => {
    assert.ok(REQUESTABLE_FORMATS.includes(KEEP_ORIGINAL_FORMAT));
    for (const name of [...FORMAT_NAMES, "jpeg", "tif"]) {
      assert.ok(REQUESTABLE_FORMATS.includes(name), `missing ${name}`);
    }
  });

  it("builds a glob covering every readable extension", () => {
    for (const extension of ["jpg", "jpeg", "png", "webp", "avif", "tiff", "tif", "gif"]) {
      assert.ok(
        IMAGE_GLOB_PATTERN.includes(extension),
        `glob missing ${extension}`,
      );
    }
  });
});
